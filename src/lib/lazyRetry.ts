import type { ComponentType } from "react";
import { recoverFromChunkLoadFailure } from "./chunkLoadRecovery";
import { buildInfo, type BuildInfo } from "./buildInfo";
import { recordBuildAsset } from "./buildAssetDiagnostics";
import { endPerf, startPerf } from "./perf";
import {
  logRouteLifecycle,
  recordFailedImport,
  recordFailedImportDependencyProbe,
  recordFailedImportProbe,
  type ChunkDependencyProbe,
  type ChunkProbe,
} from "./routeDiagnostics";
import { reportSystemError } from "../services/systemSignalReporter";

const lazyImportAttempts = 3;
const lazyImportBaseDelayMs = 450;

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

type BuildManifest = {
  assets?: string[];
  routeAssets?: Partial<Record<RouteAssetKey, string[]>>;
};

type RouteAssetKey =
  | "access"
  | "admin"
  | "create"
  | "explore"
  | "insightsFixture"
  | "landing"
  | "manifestRestore"
  | "publicForm"
  | "publicRoadmap"
  | "submissionDetail"
  | "troubleshooting"
  | "zkloginCallback";

type RouteChunkSpec = {
  exportName: string;
  filePrefix: string;
  routeKey: RouteAssetKey;
};

export class MissingLazyRouteExportError extends Error {
  readonly category = "missingExport";
  readonly expectedExport: string;
  readonly moduleKeys: string[];
  readonly resolvedExport: "missing";

  constructor(label: string, expectedExport: string, moduleKeys: string[]) {
    super(`Route lazy module ${label} loaded but export ${expectedExport} was missing.`);
    this.name = "MissingLazyRouteExportError";
    this.expectedExport = expectedExport;
    this.moduleKeys = moduleKeys;
    this.resolvedExport = "missing";
  }
}

const routeChunkByLabel: Record<string, RouteChunkSpec> = {
  "route-access-management": { exportName: "AccessManagementPage", filePrefix: "AccessManagementPage", routeKey: "access" },
  "route-admin-dashboard": { exportName: "AdminDashboardPage", filePrefix: "AdminDashboardPage", routeKey: "admin" },
  "route-explore": { exportName: "ExploreSignalsPage", filePrefix: "ExploreSignalsPage", routeKey: "explore" },
  "route-form-builder": { exportName: "FormBuilderPage", filePrefix: "FormBuilderPage", routeKey: "create" },
  "prefetch-route-admin-dashboard": { exportName: "AdminDashboardPage", filePrefix: "AdminDashboardPage", routeKey: "admin" },
  "prefetch-route-explore": { exportName: "ExploreSignalsPage", filePrefix: "ExploreSignalsPage", routeKey: "explore" },
  "route-insights-fixture": { exportName: "InsightsFixturePage", filePrefix: "InsightsFixturePage", routeKey: "insightsFixture" },
  "route-landing": { exportName: "LandingPage", filePrefix: "LandingPage", routeKey: "landing" },
  "route-manifest-restore": { exportName: "ManifestRestorePage", filePrefix: "ManifestRestorePage", routeKey: "manifestRestore" },
  "route-public-form": { exportName: "PublicFormPage", filePrefix: "PublicFormPage", routeKey: "publicForm" },
  "route-public-roadmap": { exportName: "PublicRoadmapPage", filePrefix: "PublicRoadmapPage", routeKey: "publicRoadmap" },
  "route-submission-detail": { exportName: "SubmissionDetailPage", filePrefix: "SubmissionDetailPage", routeKey: "submissionDetail" },
  "route-troubleshooting": { exportName: "TroubleshootingPage", filePrefix: "TroubleshootingPage", routeKey: "troubleshooting" },
  "route-zklogin-callback": { exportName: "ZkLoginCallbackPage", filePrefix: "ZkLoginCallbackPage", routeKey: "zkloginCallback" },
  "app-shell": { exportName: "AppShell", filePrefix: "AppShell", routeKey: "admin" },
  "wallet-providers": { exportName: "WalletProviders", filePrefix: "providers", routeKey: "admin" },
  "walrus-runtime-provider": { exportName: "WalrusRuntimeProvider", filePrefix: "WalrusRuntimeProvider", routeKey: "admin" },
};

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

function isMobileSafari() {
  if (typeof navigator === "undefined") {
    return false;
  }
  const userAgent = navigator.userAgent;
  return /iP(?:hone|ad|od)/.test(userAgent) && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(userAgent);
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
  if (isMobileSafari()) {
    return 15_000;
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

async function withLazyImportTimeout<T>(task: Promise<T>, label: string, timeoutMs: number, chunkUrl?: string | null) {
  if (typeof window === "undefined") {
    return task;
  }
  let timeoutHandle = 0;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = window.setTimeout(() => {
      const error = new LazyImportTimeoutError(label, timeoutMs);
      logRouteLifecycle("lazy-import-timeout", {
        label,
        chunkUrl: chunkUrl ?? null,
        routePath: getCurrentRoutePath(),
        timeoutMs,
        userAgent: navigator.userAgent,
      });
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
  try {
    const response = await fetch(appendCacheBust(url, 0), {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    const body = await response.text();
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
    return {
      bodyEmpty,
      bodyHash: hashSnippet(snippet),
      bodyLooksLikeHtml,
      contentLength,
      contentType,
      ok,
      snippet,
      status: response.status,
      truncated,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      snippet: error instanceof Error ? error.message : String(error),
      url,
    };
  }
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
  return { value: null, resolvedExport: "missing" as const };
}

export function resolveLazyRouteModule<TProps extends object = Record<string, never>>(
  module: unknown,
  label: string,
  exportName = routeChunkByLabel[label]?.exportName ?? "default",
): { default: ComponentType<TProps> } {
  const moduleKeys = getModuleKeys(module);
  const resolved = readModuleExport(module, exportName);
  if (!resolved.value) {
    const error = new MissingLazyRouteExportError(label, exportName, moduleKeys);
    recordFailedImport(label, error, null, {
      category: "missingExport",
      expectedExport: exportName,
      moduleKeys,
      resolvedExport: "missing",
    });
    console.error("[DeepSignal route lazy export missing]", {
      label,
      expectedExport: exportName,
      moduleKeys,
      buildVersion: buildInfo.appVersion,
      buildTime: buildInfo.buildTime,
      gitHash: buildInfo.gitHash,
    });
    throw error;
  }
  return { default: resolved.value as ComponentType<TProps> };
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
      const result =
        attempt === 1 || !expectedChunkUrl
          ? await withLazyImportTimeout(loader(), label, timeoutMs, expectedChunkUrl)
          : (await withLazyImportTimeout(importCacheBustedRouteChunk<T>(label, expectedChunkUrl, attempt), label, timeoutMs, expectedChunkUrl)) ??
            (await withLazyImportTimeout(loader(), label, timeoutMs, expectedChunkUrl));
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
      endPerf(perfName, "ok", `attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      recordFailedImport(label, error, expectedChunkUrl, {
        category: error instanceof LazyImportTimeoutError ? "timeout" : "runtime",
      });
      logRouteLifecycle(error instanceof LazyImportTimeoutError ? "lazy-import-timeout-recorded" : "lazy-import-rejected", {
        label,
        attempt,
        chunkUrl: expectedChunkUrl ?? null,
        message: error instanceof Error ? error.message : String(error),
        routePath: getCurrentRoutePath(),
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      });
      if (expectedChunkUrl) {
        const probe = await probeChunk(expectedChunkUrl);
        recordFailedImportProbe(label, probe);
        const dependencyProbe = await probeChunkDependencyTree(expectedChunkUrl);
        recordFailedImportDependencyProbe(label, dependencyProbe);
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
