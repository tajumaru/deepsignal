import type { ComponentType } from "react";
import { isChunkLoadFailure, recoverFromChunkLoadFailure } from "./chunkLoadRecovery";
import { buildInfo, type BuildInfo } from "./buildInfo";
import { recordBuildAsset } from "./buildAssetDiagnostics";
import { endPerf, startPerf } from "./perf";
import {
  getBrowserCapabilitiesSnapshot,
  isMobileSafariLike,
  hasResourceErrorForUrl,
  logRouteLifecycle,
  recordFailedImport,
  recordFailedImportDependencyProbe,
  recordFailedImportProbe,
  type ChunkDependencyProbe,
  type ChunkProbe,
} from "./routeDiagnostics";
import { lazyChunkExportSpecs } from "./lazyRouteRegistry";
import type { RouteAssetKey, RouteChunkSpec } from "./lazyRouteRegistry";
import { reportSystemError } from "../services/systemSignalReporter";

const lazyImportAttempts = 3;
const lazyImportBaseDelayMs = 450;
const proactiveDependencyProbeLabels = new Set(["app-shell"]);
const recordedLazyImportTimeouts = new Set<string>();
const mobileSafariLazyImportMaxConcurrency = 1;
let mobileSafariLazyImportActiveCount = 0;
const mobileSafariLazyImportQueue: Array<() => void> = [];

class LazyImportTimeoutError extends Error {
  readonly category = "timeout";

  constructor(label: string, timeoutMs: number) {
    super(`Lazy import ${label} stayed pending for ${timeoutMs}ms.`);
    this.name = "LazyImportTimeoutError";
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function runWithMobileSafariLazyImportQueue<T>(task: () => Promise<T>) {
  if (typeof window === "undefined" || !getBrowserCapabilitiesSnapshot().mobileSafari) {
    return task();
  }
  if (mobileSafariLazyImportActiveCount >= mobileSafariLazyImportMaxConcurrency) {
    await new Promise<void>((resolve) => {
      mobileSafariLazyImportQueue.push(resolve);
    });
  }
  mobileSafariLazyImportActiveCount += 1;
  try {
    return await task();
  } finally {
    mobileSafariLazyImportActiveCount = Math.max(0, mobileSafariLazyImportActiveCount - 1);
    const next = mobileSafariLazyImportQueue.shift();
    next?.();
  }
}

type BuildManifest = {
  assets?: string[];
  routeAssets?: Partial<Record<RouteAssetKey, string[]>>;
};

export class MissingLazyRouteExportError extends Error {
  readonly category = "missingExport";
  readonly label: string;
  readonly routeId: string;
  readonly routePath: string;
  readonly chunkUrl: string | null;
  readonly expectedExport: string;
  readonly availableExports: string[];
  readonly moduleKeys: string[];
  readonly resolvedExport: "missing";
  readonly buildVersion: string;
  readonly buildTime: string;
  readonly gitHash: string;
  readonly userAgent: string;
  readonly mobileSafari: boolean;
  readonly currentUrl: string;
  readonly pathname: string;
  readonly hash: string;

  constructor({
    availableExports,
    chunkUrl,
    expectedExport,
    label,
  }: {
    availableExports: string[];
    chunkUrl?: string | null;
    expectedExport: string;
    label: string;
  }) {
    super(`Route lazy module ${label} loaded but export ${expectedExport} was missing.`);
    this.name = "MissingLazyRouteExportError";
    this.label = label;
    this.routeId = getCurrentRouteId(label);
    this.routePath = getCurrentRoutePath();
    this.chunkUrl = chunkUrl ?? null;
    this.expectedExport = expectedExport;
    this.availableExports = availableExports;
    this.moduleKeys = availableExports;
    this.resolvedExport = "missing";
    this.buildVersion = buildInfo.appVersion;
    this.buildTime = buildInfo.buildTime;
    this.gitHash = buildInfo.gitHash;
    this.userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
    this.mobileSafari =
      typeof navigator !== "undefined"
        ? isMobileSafariLike(navigator.userAgent || "", navigator.platform || "", navigator.maxTouchPoints ?? 0)
        : false;
    this.currentUrl = typeof window === "undefined" ? "" : window.location.href;
    this.pathname = typeof window === "undefined" ? "" : window.location.pathname;
    this.hash = typeof window === "undefined" ? "" : window.location.hash;
  }
}

const routeChunkByLabel: Record<string, RouteChunkSpec> = lazyChunkExportSpecs;

let buildManifestPromise: Promise<BuildManifest | null> | null = null;

function getModuleBuildInfo(module: unknown): Pick<BuildInfo, "appVersion" | "buildTime" | "gitHash"> | null {
  if (!module || typeof module !== "object") {
    return null;
  }
  let value: unknown;
  try {
    value = (module as { DEEPSIGNAL_ROUTE_BUILD?: unknown }).DEEPSIGNAL_ROUTE_BUILD;
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<BuildInfo>;
  if (
    typeof candidate.appVersion === "string" &&
    typeof candidate.buildTime === "string" &&
    typeof candidate.gitHash === "string"
  ) {
    return {
      appVersion: candidate.appVersion,
      buildTime: candidate.buildTime,
      gitHash: candidate.gitHash,
    };
  }
  return null;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Android|iP(?:hone|ad|od)|Mobile/i.test(navigator.userAgent);
}

function getLazyImportTimeoutMs() {
  if (typeof window === "undefined") {
    return 8_000;
  }
  if (getBrowserCapabilitiesSnapshot().mobileSafari) {
    return 12_000;
  }
  if (isMobileBrowser()) {
    return 12_000;
  }
  return 8_000;
}

function getCurrentRoutePath() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.hash?.replace(/^#/, "") || `${window.location.pathname}${window.location.search}`;
}

function getCurrentRouteId(label: string) {
  const routePath = getCurrentRoutePath();
  const pathname = routePath.split(/[?#]/)[0] || "";
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "dashboard";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "admin";
  }
  if (pathname === "/create" || pathname === "/compose" || pathname.startsWith("/admin/forms/new")) {
    return "create";
  }
  if (pathname.startsWith("/f/")) {
    return "publicForm";
  }
  if (pathname === "/explore" || pathname === "/signals") {
    return "explore";
  }
  return routeChunkByLabel[label]?.routeKey ?? "unknown";
}

function getLazyTimeoutKey(label: string, attempt: number, routePath: string) {
  return `${label}:${attempt}:${routePath}`;
}

function logPublicAppShellTrace(event: "public-app-shell:resolve" | "public-app-shell:waiting" | "public-app-shell:blocker", details: Record<string, unknown>) {
  if ((details.label as string | undefined) !== "public-app-shell") {
    return;
  }
  logRouteLifecycle(event, details);
}

function logLazyImportTimeoutOnce({
  attempt,
  chunkUrl,
  elapsedMs,
  label,
  routePath,
  timeoutMs,
  userAgent,
}: {
  attempt: number;
  chunkUrl: string | null | undefined;
  elapsedMs: number;
  label: string;
  routePath: string;
  timeoutMs: number;
  userAgent: string;
}) {
  const key = getLazyTimeoutKey(label, attempt, routePath);
  if (recordedLazyImportTimeouts.has(key)) {
    return;
  }
  recordedLazyImportTimeouts.add(key);
  if (recordedLazyImportTimeouts.size > 80) {
    const oldest = recordedLazyImportTimeouts.values().next().value;
    if (oldest) {
      recordedLazyImportTimeouts.delete(oldest);
    }
  }
  logRouteLifecycle("lazy-import-timeout", {
    label,
    attempt,
    chunkUrl: chunkUrl ?? null,
    routePath,
    elapsedMs,
    timeoutMs,
    userAgent,
    buildVersion: buildInfo.appVersion,
  });
}

async function withLazyImportTimeout<T>(
  task: Promise<T>,
  label: string,
  timeoutMs: number,
  chunkUrl: string | null | undefined,
  attempt: number,
) {
  if (typeof window === "undefined") {
    return task;
  }
  let timeoutHandle = 0;
  const startedAt = performance.now();
  let settled = false;
  const routePath = getCurrentRoutePath();
  const userAgent = navigator.userAgent;
  const watchdogMs = Array.from(new Set([5_000, 10_000, timeoutMs, 20_000])).sort((left, right) => left - right);
  const watchdogHandles = watchdogMs.map((elapsedMs) =>
    window.setTimeout(() => {
      if (settled) {
        return;
      }
      if (elapsedMs === timeoutMs) {
        logLazyImportTimeoutOnce({ attempt, chunkUrl, elapsedMs, label, routePath, timeoutMs, userAgent });
        logPublicAppShellTrace("public-app-shell:blocker", {
          label,
          attempt,
          chunkUrl: chunkUrl ?? null,
          elapsedMs,
          routePath,
          timeoutMs,
          reason: "timeout-threshold",
        });
        return;
      }
      logRouteLifecycle("lazy-import-still-pending", {
        label,
        attempt,
        chunkUrl: chunkUrl ?? null,
        routePath,
        elapsedMs,
        timeoutMs,
        userAgent,
        buildVersion: buildInfo.appVersion,
      });
      logPublicAppShellTrace("public-app-shell:blocker", {
        label,
        attempt,
        chunkUrl: chunkUrl ?? null,
        elapsedMs,
        routePath,
        timeoutMs,
        reason: "still-pending",
      });
    }, elapsedMs),
  );
  void task.then(
    () => {
      settled = true;
      watchdogHandles.forEach((handle) => window.clearTimeout(handle));
    },
    () => {
      settled = true;
      watchdogHandles.forEach((handle) => window.clearTimeout(handle));
    },
  );
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = window.setTimeout(() => {
      const error = new LazyImportTimeoutError(label, timeoutMs);
      const elapsedMs = Math.round(performance.now() - startedAt);
      logLazyImportTimeoutOnce({ attempt, chunkUrl, elapsedMs, label, routePath, timeoutMs, userAgent });
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

function getRouteAssetBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.location.origin + window.location.pathname;
}

function resolveAssetUrl(assetPath: string) {
  const baseUrl = getRouteAssetBaseUrl();
  if (!baseUrl) {
    return null;
  }
  return new URL(assetPath.replace(/^\.\//, "./"), baseUrl).toString();
}

async function loadBuildManifest() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!buildManifestPromise) {
    buildManifestPromise = fetch(resolveAssetUrl("./build.json") ?? "/build.json", {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`build.json returned ${response.status}`);
        }
        return (await response.json()) as BuildManifest;
      })
      .catch((error) => {
        console.warn("DeepSignal failed to load build manifest for route chunk diagnostics.", error);
        return null;
      });
  }
  return buildManifestPromise;
}

async function getExpectedChunkUrl(label: string) {
  const spec = routeChunkByLabel[label];
  if (!spec) {
    return null;
  }
  const manifest = await loadBuildManifest();
  const routeAssets = manifest?.routeAssets?.[spec.routeKey] ?? [];
  const candidateAssets = routeAssets.length > 0 ? routeAssets : manifest?.assets ?? [];
  const chunkPath = routeAssets.find((assetPath) => {
    const fileName = assetPath.split("/").pop() ?? "";
    return fileName.startsWith(`${spec.filePrefix}-`) && fileName.endsWith(".js");
  }) ?? candidateAssets.find((assetPath) => {
    const fileName = assetPath.split("/").pop() ?? "";
    return fileName.startsWith(`${spec.filePrefix}-`) && fileName.endsWith(".js");
  });
  return chunkPath ? resolveAssetUrl(chunkPath) : null;
}

function appendCacheBust(url: string, attempt: number) {
  const nextUrl = new URL(url, window.location.href);
  nextUrl.searchParams.set("route-chunk-cache-bust", `${Date.now()}-${attempt}`);
  nextUrl.searchParams.set("build", buildInfo.appVersion);
  return nextUrl.toString();
}

function hashSnippet(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
}

function isJavaScriptLikeContent(contentType: string) {
  return contentType.includes("javascript") || contentType.includes("ecmascript") || contentType.includes("application/x-javascript");
}

function responseBodyLooksWrong(body: string) {
  const prefix = body.slice(0, 240).replace(/\s+/g, " ");
  return {
    bodyLooksLikeGatewayError: /upstream connect error|reset before headers|service unavailable/i.test(prefix),
    bodyLooksLikeHtml: /^<!doctype html/i.test(prefix) || /^<html/i.test(prefix),
  };
}

function getContentLengthMismatch(contentLength: string, body: string) {
  const parsedLength = Number(contentLength);
  return Number.isFinite(parsedLength) && parsedLength >= 0 && parsedLength !== body.length;
}

async function probeChunk(url: string): Promise<ChunkProbe> {
  const probeStartedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  const probeUrl = appendCacheBust(url, 0);
  try {
    const response = await fetch(probeUrl, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    const body = await response.text();
    const elapsedMs = Math.round((typeof performance === "undefined" ? Date.now() : performance.now()) - probeStartedAt);
    const snippet = body.slice(0, 180).replace(/\s+/g, " ");
    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length") || String(body.length);
    const { bodyLooksLikeGatewayError, bodyLooksLikeHtml } = responseBodyLooksWrong(body);
    const bodyEmpty = body.length === 0;
    const truncated = getContentLengthMismatch(contentLength, body);
    const ok =
      response.ok &&
      (isJavaScriptLikeContent(contentType) || url.split("?")[0].endsWith(".css")) &&
      !bodyLooksLikeHtml &&
      !bodyLooksLikeGatewayError &&
      !bodyEmpty &&
      !truncated;
    const resourceTiming = getResourceTiming(probeUrl, url);
    return {
      bodyEmpty,
      bodyHash: hashSnippet(snippet),
      bodyLooksLikeHtml,
      contentLength,
      contentType,
      decodedBodySize: resourceTiming?.decodedBodySize,
      elapsedMs,
      encodedBodySize: resourceTiming?.encodedBodySize,
      initiatorType: resourceTiming?.initiatorType,
      ok,
      resourceErrorFired: hasResourceErrorForUrl(url) || hasResourceErrorForUrl(probeUrl),
      resourceTimingExists: Boolean(resourceTiming),
      snippet,
      status: response.status,
      transferSize: resourceTiming?.transferSize,
      truncated,
      url,
    };
  } catch (error) {
    const elapsedMs = Math.round((typeof performance === "undefined" ? Date.now() : performance.now()) - probeStartedAt);
    const resourceTiming = getResourceTiming(probeUrl, url);
    return {
      elapsedMs,
      ok: false,
      resourceErrorFired: hasResourceErrorForUrl(url) || hasResourceErrorForUrl(probeUrl),
      resourceTimingExists: Boolean(resourceTiming),
      snippet: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

function getResourceTiming(probeUrl: string, originalUrl: string) {
  if (typeof performance === "undefined" || typeof performance.getEntriesByName !== "function") {
    return null;
  }
  const entries = [
    ...performance.getEntriesByName(probeUrl),
    ...performance.getEntriesByName(originalUrl),
  ].filter((entry): entry is PerformanceResourceTiming => "initiatorType" in entry);
  return entries[entries.length - 1] ?? null;
}

function extractDependencyUrls(sourceUrl: string, source: string) {
  const dependencies = new Set<string>();
  const quotedAssetPattern = /["'](\.\/[^"']+\.(?:js|css|wasm)(?:\?[^"']*)?)["']/g;
  for (const match of source.matchAll(quotedAssetPattern)) {
    const value = match[1];
    try {
      dependencies.add(new URL(value, sourceUrl).toString());
    } catch {
      // Keep diagnostics best effort; malformed references are not expected in Vite output.
    }
  }
  return [...dependencies];
}

function getModuleKeys(module: unknown) {
  if (!module || typeof module !== "object") {
    return [];
  }
  try {
    return Object.keys(module as Record<string, unknown>).sort();
  } catch {
    return [];
  }
}

function readModuleExport(module: unknown, exportName: string) {
  const moduleRecord = module && typeof module === "object" ? (module as Record<string, unknown>) : {};
  let defaultExport: unknown;
  try {
    defaultExport = moduleRecord.default;
  } catch {
    defaultExport = undefined;
  }
  if (defaultExport) {
    return { value: defaultExport, resolvedExport: "default" as const };
  }
  let namedExport: unknown;
  try {
    namedExport = moduleRecord[exportName];
  } catch {
    namedExport = undefined;
  }
  if (namedExport) {
    return { value: namedExport, resolvedExport: exportName };
  }
  for (const value of Object.values(moduleRecord)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const nestedRecord = value as Record<string, unknown>;
    let nestedExport: unknown;
    try {
      nestedExport = nestedRecord[exportName];
    } catch {
      nestedExport = undefined;
    }
    if (nestedExport) {
      return { value: nestedExport, resolvedExport: `nested:${exportName}` as const };
    }
  }
  return { value: null, resolvedExport: "missing" as const };
}

function recordMissingRouteExport(label: string, error: MissingLazyRouteExportError, chunkUrl?: string | null) {
  recordFailedImport(label, error, chunkUrl ?? error.chunkUrl, {
    availableExports: error.availableExports,
    category: "missingExport",
    currentUrl: error.currentUrl,
    expectedExport: error.expectedExport,
    hash: error.hash,
    mobileSafari: error.mobileSafari,
    moduleKeys: error.moduleKeys,
    pathname: error.pathname,
    resolvedExport: "missing",
    routeId: error.routeId,
    routePath: error.routePath,
    userAgent: error.userAgent,
  });
  logRouteLifecycle("lazy-route-export-missing", {
    availableExports: error.availableExports,
    buildTime: error.buildTime,
    buildVersion: error.buildVersion,
    chunkUrl: chunkUrl ?? error.chunkUrl,
    currentUrl: error.currentUrl,
    expectedExport: error.expectedExport,
    gitHash: error.gitHash,
    hash: error.hash,
    label,
    mobileSafari: error.mobileSafari,
    pathname: error.pathname,
    routeId: error.routeId,
    routePath: error.routePath,
    userAgent: error.userAgent,
  });
  console.error("[DeepSignal route lazy export missing]", {
    label,
    routeId: error.routeId,
    routePath: error.routePath,
    chunkUrl: chunkUrl ?? error.chunkUrl,
    expectedExport: error.expectedExport,
    availableExports: error.availableExports,
    buildVersion: error.buildVersion,
    buildTime: error.buildTime,
    gitHash: error.gitHash,
    userAgent: error.userAgent,
    mobileSafari: error.mobileSafari,
    currentUrl: error.currentUrl,
    pathname: error.pathname,
    hash: error.hash,
  });
}

function createMissingRouteExportError(label: string, module: unknown, expectedExport: string, chunkUrl?: string | null) {
  return new MissingLazyRouteExportError({
    availableExports: getModuleKeys(module),
    chunkUrl,
    expectedExport,
    label,
  });
}

export function resolveLazyRouteModule<TProps extends object = Record<string, never>>(
  module: unknown,
  label: string,
  exportName = routeChunkByLabel[label]?.exportName ?? "default",
): { default: ComponentType<TProps> } {
  const resolved = readModuleExport(module, exportName);
  if (!resolved.value) {
    const error = createMissingRouteExportError(label, module, exportName);
    recordMissingRouteExport(label, error);
    throw error;
  }
  return { default: resolved.value as ComponentType<TProps> };
}

export async function resolveLazyRouteModuleWithSafariRetry<TProps extends object = Record<string, never>>(
  module: unknown,
  label: string,
  exportName = routeChunkByLabel[label]?.exportName ?? "default",
): Promise<{ default: ComponentType<TProps> }> {
  const resolved = readModuleExport(module, exportName);
  if (resolved.value) {
    return { default: resolved.value as ComponentType<TProps> };
  }

  const expectedChunkUrl = await getExpectedChunkUrl(label);
  if (getBrowserCapabilitiesSnapshot().mobileSafari && expectedChunkUrl) {
    logRouteLifecycle("lazy-route-export-cache-bust-retry", {
      label,
      routeId: getCurrentRouteId(label),
      routePath: getCurrentRoutePath(),
      chunkUrl: expectedChunkUrl,
      expectedExport: exportName,
      availableExports: getModuleKeys(module),
      buildVersion: buildInfo.appVersion,
      buildTime: buildInfo.buildTime,
      gitHash: buildInfo.gitHash,
      userAgent: navigator.userAgent,
    });
    const retriedModule = await importRawCacheBustedRouteChunk(label, expectedChunkUrl, 1_001).catch((error) => {
      logRouteLifecycle("lazy-route-export-cache-bust-retry-failed", {
        label,
        routeId: getCurrentRouteId(label),
        routePath: getCurrentRoutePath(),
        chunkUrl: expectedChunkUrl,
        expectedExport: exportName,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    const retriedResolved = readModuleExport(retriedModule, exportName);
    if (retriedResolved.value) {
      logRouteLifecycle("lazy-route-export-cache-bust-retry-resolved", {
        label,
        routeId: getCurrentRouteId(label),
        routePath: getCurrentRoutePath(),
        chunkUrl: expectedChunkUrl,
        expectedExport: exportName,
        resolvedExport: retriedResolved.resolvedExport,
      });
      return { default: retriedResolved.value as ComponentType<TProps> };
    }
  }

  const error = createMissingRouteExportError(label, module, exportName, expectedChunkUrl);
  recordMissingRouteExport(label, error, expectedChunkUrl);
  throw error;
}

async function probeChunkDependencyTree(parentUrl: string): Promise<ChunkDependencyProbe> {
  const pending = [parentUrl];
  const seen = new Set<string>();
  const dependencies: ChunkProbe[] = [];
  const maxDependencies = 120;

  while (pending.length > 0 && seen.size < maxDependencies) {
    const currentUrl = pending.shift();
    if (!currentUrl || seen.has(currentUrl)) {
      continue;
    }
    seen.add(currentUrl);

    const probe = await probeChunk(currentUrl);
    if (currentUrl !== parentUrl) {
      dependencies.push(probe);
    }

    if (!probe.ok || !currentUrl.split("?")[0].endsWith(".js")) {
      continue;
    }

    try {
      const response = await fetch(appendCacheBust(currentUrl, 1), {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      });
      if (!response.ok || !isJavaScriptLikeContent(response.headers.get("content-type") || "")) {
        continue;
      }
      const source = await response.text();
      for (const dependencyUrl of extractDependencyUrls(currentUrl, source)) {
        if (!seen.has(dependencyUrl)) {
          pending.push(dependencyUrl);
        }
      }
    } catch {
      // The parent probe already captured the fetch failure. Dependency walking is diagnostic only.
    }
  }

  const failedCount = dependencies.filter((probe) => !probe.ok).length;
  return {
    dependencies,
    failedCount,
    parentUrl,
    totalCount: dependencies.length,
  };
}

function probeLazyImportDependenciesOnStart(label: string, chunkUrl: string | null, attempt: number) {
  if (!chunkUrl || !proactiveDependencyProbeLabels.has(label)) {
    return;
  }
  void probeChunkDependencyTree(chunkUrl)
    .then((dependencyProbe) => {
      logRouteLifecycle("lazy-import-dependency-probe", {
        label,
        attempt,
        chunkUrl,
        routePath: getCurrentRoutePath(),
        dependencyTotal: dependencyProbe.totalCount,
        dependencyFailures: dependencyProbe.failedCount,
        dependencies: dependencyProbe.dependencies.map((dependency) => ({
          bodyLooksLikeHtml: dependency.bodyLooksLikeHtml,
          contentLength: dependency.contentLength,
          contentType: dependency.contentType,
          elapsedMs: dependency.elapsedMs,
          ok: dependency.ok,
          resourceErrorFired: dependency.resourceErrorFired,
          resourceTimingExists: dependency.resourceTimingExists,
          status: dependency.status,
          url: dependency.url,
        })),
      });
    })
    .catch((error) => {
      logRouteLifecycle("lazy-import-dependency-probe-failed", {
        label,
        attempt,
        chunkUrl,
        routePath: getCurrentRoutePath(),
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

async function importCacheBustedRouteChunk<T>(label: string, chunkUrl: string, attempt: number): Promise<T | null> {
  const spec = routeChunkByLabel[label];
  if (!spec) {
    return null;
  }
  const cacheBustedUrl = appendCacheBust(chunkUrl, attempt);
  const module = (await import(/* @vite-ignore */ cacheBustedUrl)) as Record<string, unknown>;
  const exported = module[spec.exportName] ?? module.default;
  if (!exported) {
    throw new Error(`Route chunk ${label} loaded but export ${spec.exportName} was missing.`);
  }
  return { ...module, default: exported } as T;
}

async function importRawCacheBustedRouteChunk(label: string, chunkUrl: string, attempt: number): Promise<unknown | null> {
  if (!routeChunkByLabel[label]) {
    return null;
  }
  return import(/* @vite-ignore */ appendCacheBust(chunkUrl, attempt));
}

export async function retryLazyImport<T>(loader: () => Promise<T>, label = "anonymous"): Promise<T> {
  let lastError: unknown;
  const perfName = `lazy:${label}`;
  const expectedChunkUrl = await getExpectedChunkUrl(label);
  const timeoutMs = getLazyImportTimeoutMs();
  startPerf(perfName);

  for (let attempt = 1; attempt <= lazyImportAttempts; attempt += 1) {
    try {
      logRouteLifecycle("lazy-import-start", {
        label,
        attempt,
        chunkUrl: expectedChunkUrl ?? null,
        routePath: getCurrentRoutePath(),
        timeoutMs,
      });
      logPublicAppShellTrace("public-app-shell:waiting", {
        label,
        attempt,
        chunkUrl: expectedChunkUrl ?? null,
        routePath: getCurrentRoutePath(),
        timeoutMs,
      });
      if (attempt === 1) {
        probeLazyImportDependenciesOnStart(label, expectedChunkUrl, attempt);
      }
      const result =
        attempt === 1 || !expectedChunkUrl
          ? await runWithMobileSafariLazyImportQueue(() =>
              withLazyImportTimeout(loader(), label, timeoutMs, expectedChunkUrl, attempt),
            )
          : (await runWithMobileSafariLazyImportQueue(() =>
              withLazyImportTimeout(importCacheBustedRouteChunk<T>(label, expectedChunkUrl, attempt), label, timeoutMs, expectedChunkUrl, attempt),
            )) ??
            (await runWithMobileSafariLazyImportQueue(() =>
              withLazyImportTimeout(loader(), label, timeoutMs, expectedChunkUrl, attempt),
            ));
      const moduleBuildInfo = getModuleBuildInfo(result) ?? buildInfo;
      recordBuildAsset(`lazy:${label}`, moduleBuildInfo);
      console.info("[DeepSignal route chunk]", {
        label,
        chunkUrl: expectedChunkUrl,
        buildVersion: moduleBuildInfo.appVersion,
        buildTime: moduleBuildInfo.buildTime,
        gitHash: moduleBuildInfo.gitHash,
      });
      logRouteLifecycle("lazy-import-resolved", {
        label,
        attempt,
        chunkUrl: expectedChunkUrl ?? null,
        routePath: getCurrentRoutePath(),
      });
      logPublicAppShellTrace("public-app-shell:resolve", {
        label,
        attempt,
        chunkUrl: expectedChunkUrl ?? null,
        routePath: getCurrentRoutePath(),
      });
      endPerf(perfName, "ok", `attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      recordFailedImport(label, error, expectedChunkUrl, {
        category: error instanceof LazyImportTimeoutError ? "timeout" : isChunkLoadFailure(error) ? "chunkLoad" : "runtime",
        attempt,
        routePath: getCurrentRoutePath(),
        elapsedMs: timeoutMs,
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      });
      logRouteLifecycle(error instanceof LazyImportTimeoutError ? "lazy-import-timeout-recorded" : "lazy-import-rejected", {
        label,
        attempt,
        chunkUrl: expectedChunkUrl ?? null,
        message: error instanceof Error ? error.message : String(error),
        routePath: getCurrentRoutePath(),
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      });
      logPublicAppShellTrace("public-app-shell:blocker", {
        label,
        attempt,
        chunkUrl: expectedChunkUrl ?? null,
        message: error instanceof Error ? error.message : String(error),
        routePath: getCurrentRoutePath(),
        timeoutMs,
        reason: error instanceof LazyImportTimeoutError ? "timeout" : "rejected",
      });
      if (expectedChunkUrl) {
        const probe = await probeChunk(expectedChunkUrl);
        recordFailedImportProbe(label, probe);
        const dependencyProbe = await probeChunkDependencyTree(expectedChunkUrl);
        recordFailedImportDependencyProbe(label, dependencyProbe);
        const failureStage = probe.ok ? "evaluation" : "fetch";
        logRouteLifecycle("lazy-import-diagnostics", {
          label,
          attempt,
          category: error instanceof LazyImportTimeoutError ? "timeout" : isChunkLoadFailure(error) ? "chunkLoad" : "runtime",
          failureStage,
          chunkUrl: expectedChunkUrl,
          routePath: getCurrentRoutePath(),
          parentChunk: {
            status: probe.status ?? null,
            contentType: probe.contentType ?? null,
            contentLength: probe.contentLength ?? null,
            decodedBodySize: probe.decodedBodySize ?? null,
            resourceTimingExists: probe.resourceTimingExists ?? false,
          },
        });
        logPublicAppShellTrace("public-app-shell:blocker", {
          label,
          attempt,
          chunkUrl: expectedChunkUrl,
          routePath: getCurrentRoutePath(),
          timeoutMs,
          reason: "diagnostics",
          probeOk: probe.ok,
          probeStatus: probe.status ?? null,
          probeContentType: probe.contentType ?? null,
          dependencyFailures: dependencyProbe.failedCount,
          dependencyTotal: dependencyProbe.totalCount,
        });
        reportSystemError({
          error,
          chunkUrl: expectedChunkUrl,
          severity: attempt === lazyImportAttempts ? "critical" : "warning",
          sourceContext: "lazy-route-import",
          diagnostics: {
            label,
            attempt,
            probe,
            dependencyProbe,
          },
        });
        console.warn("[DeepSignal route chunk probe]", {
          label,
          attempt,
          errorName: error instanceof Error ? error.name : "Error",
          errorMessage: error instanceof Error ? error.message : String(error),
          dependencyFailures: dependencyProbe.dependencies.filter((dependency) => !dependency.ok),
          dependencyTotal: dependencyProbe.totalCount,
          ...probe,
        });
      }
      if (attempt === lazyImportAttempts) {
        break;
      }
      await wait(lazyImportBaseDelayMs * attempt);
    }
  }

  if (!(lastError instanceof LazyImportTimeoutError)) {
    recoverFromChunkLoadFailure(lastError);
  }
  endPerf(perfName, "failed", lastError instanceof Error ? lastError.message : String(lastError));
  throw lastError;
}
