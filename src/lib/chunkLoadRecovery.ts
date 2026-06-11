import { buildInfo } from "./buildInfo";
import { requestBuildUpdateNotice } from "./buildUpdate";
import { getMixedBuildStatus } from "./buildAssetDiagnostics";
import { logRouteLifecycle } from "./routeDiagnostics";
import { getRouteRuntimeMetadata } from "../routes/routeRuntimePolicy";
import { getWalletProviderRuntimeSnapshot } from "../components/WalletSurfaceRuntime";

const reloadStorageKey = "deepsignal.chunkLoadRecovery";
const recoveryWindowMs = 2 * 60 * 1000;
const maxReloadsPerWindow = 1;

type ReloadState = {
  startedAt: number;
  count: number;
  buildId?: string;
};

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

let reloadScheduled = false;

type ChunkRecoveryContext = {
  routePath?: string;
  policyId?: string;
  walletContextReady?: boolean;
};

export type ChunkLoadFailureCategory = "chunk-load" | "text-html-mime" | "css-preload" | "vite-preload" | "module-script" | "other";

export type ChunkLoadRecoveryAction = "none" | "reload" | "manual-refresh" | "ignore-css-preload" | "ignore-preload-only" | "ignore";

export type ChunkLoadRecoveryOutcome = {
  category: ChunkLoadFailureCategory;
  fallbackAction: ChunkLoadRecoveryAction;
  reachedLimit: boolean;
  retryCount: number;
  retryLimit: number;
};

export type ChunkLoadFailureDiagnostics = {
  chunkUrl: string | null;
  buildVersion: string;
  buildTime: string;
  gitHash: string;
  retryCount: number;
  retryLimit: number;
  mixedBuildAssetsDetected: boolean;
  mixedBuildReason?: string;
  errorName: string;
  errorMessage: string;
  recordedAt: string;
};

declare global {
  interface Window {
    __DEEPSIGNAL_CHUNK_LOAD_FAILURE__?: ChunkLoadFailureDiagnostics;
  }
}

function currentBuildId() {
  return [buildInfo.appVersion, buildInfo.buildTime, buildInfo.gitHash].filter(Boolean).join("|");
}

function readReloadState(now: number): ReloadState {
  try {
    const raw = window.sessionStorage.getItem(reloadStorageKey);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReloadState>) : null;
    if (
      parsed &&
      typeof parsed.startedAt === "number" &&
      typeof parsed.count === "number" &&
      parsed.buildId === currentBuildId() &&
      now - parsed.startedAt < recoveryWindowMs
    ) {
      return { startedAt: parsed.startedAt, count: parsed.count, buildId: parsed.buildId };
    }
  } catch {
    // Best effort only; the reload guard should never block normal app startup.
  }

  return { startedAt: now, count: 0, buildId: currentBuildId() };
}

function rememberReloadState(state: ReloadState) {
  try {
    window.sessionStorage.setItem(reloadStorageKey, JSON.stringify(state));
  } catch {
    // If storage is unavailable, still try to recover from the failed chunk.
  }
}

function errorText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }
  return String(error ?? "").toLowerCase();
}

function normalizeCategoryText(text: string) {
  return text.toLowerCase();
}

function isTextHtmlMimeFailure(text: string) {
  return (
    text.includes("text/html") &&
    (text.includes("mime") ||
      text.includes("not a valid javascript mime type") ||
      text.includes("not a valid javascript/type"))
  );
}

function isModuleScriptFailure(text: string) {
  return (
    text.includes("importing a module script failed") ||
    text.includes("module script failed") ||
    text.includes("failed to load module script") ||
    text.includes("error loading dynamically imported module")
  );
}

export function getChunkLoadFailureCategory(error: unknown): ChunkLoadFailureCategory {
  const text = normalizeCategoryText(errorText(error));
  if (isCssPreloadFailure(text)) {
    return "css-preload";
  }
  if (isSafariPreloadOnlyFailure(text)) {
    return "vite-preload";
  }
  if (isTextHtmlMimeFailure(text)) {
    return "text-html-mime";
  }
  if (isModuleScriptFailure(text)) {
    return "module-script";
  }
  if (isChunkLoadFailure(text)) {
    return "chunk-load";
  }
  return "other";
}

export function isCssPreloadFailure(error: unknown) {
  const text = errorText(error);
  return (
    text.includes("unable to preload css") ||
    text.includes("preload css") ||
    text.includes("preload stylesheet")
  );
}

function isMobileSafariUserAgent() {
  if (typeof navigator === "undefined") {
    return false;
  }
  const userAgent = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(userAgent) && /safari/i.test(userAgent) && !/crios|fxios|edgios/i.test(userAgent);
}

export function isChunkLoadFailure(error: unknown) {
  const text = errorText(error);
  if (isModuleScriptFailure(text)) {
    return true;
  }
  if (isTextHtmlMimeFailure(text)) {
    return true;
  }
  return (
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("importing a module script failed") ||
    text.includes("error loading dynamically imported module") ||
    text.includes("failed to load module script") ||
    text.includes("mime type") ||
    text.includes("disallowed mime type") ||
    text.includes("text/html") ||
    text.includes("not a valid javascript mime type") ||
    text.includes("vite:preloaderror")
  );
}

export function getChunkFailureUrl(error: unknown) {
  const source = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error ?? "");
  return source.match(/https?:\/\/[^\s)'"]+/)?.[0] ?? source.match(/\.\/assets\/[^\s)'"]+/)?.[0] ?? null;
}

export function isSafariPreloadOnlyFailure(error: unknown) {
  const text = errorText(error);
  return (
    text.includes("vite:preloaderror") ||
    text.includes("modulepreload") ||
    text.includes("linkresourceerror") ||
    text.includes("link resource error")
  );
}

function getFallbackActionForCategory(category: ChunkLoadFailureCategory): ChunkLoadRecoveryAction {
  if (category === "css-preload") {
    return "ignore-css-preload";
  }
  if (category === "vite-preload") {
    return "ignore-preload-only";
  }
  if (category === "text-html-mime") {
    return "manual-refresh";
  }
  if (category === "module-script" || category === "chunk-load") {
    return "reload";
  }
  return "none";
}

export function shouldPreventDefaultForChunkFailure(outcome: ChunkLoadRecoveryOutcome): boolean {
  return outcome.fallbackAction === "manual-refresh" || outcome.fallbackAction === "reload";
}

export function clearChunkLoadRecoveryState() {
  try {
    window.sessionStorage.removeItem(reloadStorageKey);
  } catch {
    // Best effort only.
  }
  reloadScheduled = false;
}

export function getChunkLoadRecoverySnapshot() {
  if (typeof window === "undefined") {
    return { count: 0, limit: maxReloadsPerWindow, windowMs: recoveryWindowMs };
  }
  const state = readReloadState(Date.now());
  return {
    count: state.count,
    limit: maxReloadsPerWindow,
    windowMs: recoveryWindowMs,
    buildId: state.buildId,
  };
}

export function getLastChunkLoadFailureDiagnostics() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.__DEEPSIGNAL_CHUNK_LOAD_FAILURE__ ?? null;
}

function rememberChunkLoadFailureDiagnostics(error: unknown, retryCount: number): ChunkLoadFailureDiagnostics {
  const mixedBuildStatus = getMixedBuildStatus();
  const diagnostics: ChunkLoadFailureDiagnostics = {
    chunkUrl: getChunkFailureUrl(error),
    buildVersion: buildInfo.appVersion,
    buildTime: buildInfo.buildTime,
    gitHash: buildInfo.gitHash,
    retryCount,
    retryLimit: maxReloadsPerWindow,
    mixedBuildAssetsDetected: mixedBuildStatus.detected,
    mixedBuildReason: mixedBuildStatus.reason,
    errorName: error instanceof Error ? error.name : "Error",
    errorMessage: error instanceof Error ? error.message : String(error ?? "Unknown chunk load failure"),
    recordedAt: new Date().toISOString(),
  };
  window.__DEEPSIGNAL_CHUNK_LOAD_FAILURE__ = diagnostics;
  return diagnostics;
}

function resolveRecoveryRoutePath(routePath?: string) {
  if (routePath) {
    return routePath;
  }
  if (typeof window === "undefined") {
    return "unknown";
  }
  if (window.location.hash) {
    return window.location.hash.replace(/^#/, "") || window.location.pathname;
  }
  return window.location.pathname || "/";
}

function resolveRecoveryPolicyId(routePath: string) {
  return getRouteRuntimeMetadata(routePath).policyId;
}

function routeRecoveryLogContext(routePath: string, context: ChunkRecoveryContext, category: ChunkLoadFailureCategory) {
  return {
    routePath,
    policyId: context.policyId ?? resolveRecoveryPolicyId(routePath),
    walletContextReady: context.walletContextReady,
    category,
  };
}

export async function clearRuntimeCaches() {
  try {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.filter((key) => key.toLowerCase().includes("deepsignal")).map((key) => window.caches.delete(key)));
    }
  } catch {
    // Cache cleanup is best effort.
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => {
            const scope = registration.scope.toLowerCase();
            return scope.includes("deepsignal") || scope.includes(window.location.host.toLowerCase());
          })
          .map(async (registration) => {
            await registration.update().catch(() => undefined);
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          }),
      );
    }
  } catch {
    // Service worker update is best effort and should never block recovery.
  }
}

export function recoverFromChunkLoadFailure(
  error: unknown,
  context: ChunkRecoveryContext = {},
): ChunkLoadRecoveryOutcome {
  const category = getChunkLoadFailureCategory(error);
  const fallbackAction = getFallbackActionForCategory(category);
  const routePath = resolveRecoveryRoutePath(context.routePath);
  const message = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : "Error";

  if (
    typeof window === "undefined" ||
    fallbackAction === "ignore-css-preload" ||
    fallbackAction === "ignore-preload-only" ||
    category === "other" ||
    !isChunkLoadFailure(error)
  ) {
    return {
      category,
      fallbackAction,
      reachedLimit: false,
      retryCount: 0,
      retryLimit: maxReloadsPerWindow,
    };
  }

  const now = Date.now();
  const state = readReloadState(now);
  const nextRetryCount = Math.min(state.count + 1, maxReloadsPerWindow);
  const diagnostics = rememberChunkLoadFailureDiagnostics(error, nextRetryCount);
  logRouteLifecycle("chunk-load-recovery-attempt", {
      ...routeRecoveryLogContext(routePath, context, category),
      fallbackAction,
      retryLimit: maxReloadsPerWindow,
      retryCount: nextRetryCount,
    mixedBuildAssetsDetected: diagnostics.mixedBuildAssetsDetected,
    chunkFailure: true,
    errorName,
    errorMessage: message,
    mixedBuildReason: diagnostics.mixedBuildReason,
    walletContextReady: context.walletContextReady,
  });
  if (state.count >= maxReloadsPerWindow || reloadScheduled) {
    console.warn("DeepSignal chunk load recovery limit reached.", diagnostics, error);
  logRouteLifecycle("chunk-load-recovery-limit-reached", {
      ...routeRecoveryLogContext(routePath, context, category),
      retryLimit: maxReloadsPerWindow,
      retryCount: nextRetryCount,
      walletContextReady: context.walletContextReady,
  });
    return {
      category,
      fallbackAction: "manual-refresh",
      reachedLimit: true,
      retryCount: nextRetryCount,
      retryLimit: maxReloadsPerWindow,
    };
  }

  reloadScheduled = true;
  rememberReloadState({ startedAt: state.startedAt, count: nextRetryCount, buildId: currentBuildId() });
  console.warn("DeepSignal chunk load failed; a controlled refresh recommendation is available.", diagnostics, error);
  requestBuildUpdateNotice("chunk_load_failure", buildInfo, {
    mixedBuildAssetsDetected: diagnostics.mixedBuildAssetsDetected,
    chunkFailure: diagnostics,
  });

  return {
    category,
    fallbackAction,
    reachedLimit: false,
    retryCount: nextRetryCount,
    retryLimit: maxReloadsPerWindow,
  };
}

export function startChunkLoadRecovery() {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleVitePreloadError = (event: VitePreloadErrorEvent) => {
    const walletRuntime = getWalletProviderRuntimeSnapshot();
    const outcome = recoverFromChunkLoadFailure(event.payload ?? "vite:preloaderror", {
      routePath: resolveRecoveryRoutePath(window.location.hash),
      policyId: resolveRecoveryPolicyId(resolveRecoveryRoutePath(window.location.hash)),
      walletContextReady: walletRuntime.contextAvailable,
    });
    if (isMobileSafariUserAgent() && isSafariPreloadOnlyFailure(event.payload ?? "vite:preloaderror")) {
      event.preventDefault();
      return;
    }
    if (shouldPreventDefaultForChunkFailure(outcome)) {
      event.preventDefault();
    }
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const walletRuntime = getWalletProviderRuntimeSnapshot();
    const outcome = recoverFromChunkLoadFailure(event.reason, {
      routePath: resolveRecoveryRoutePath(window.location.hash),
      policyId: resolveRecoveryPolicyId(resolveRecoveryRoutePath(window.location.hash)),
      walletContextReady: walletRuntime.contextAvailable,
    });
    if (shouldPreventDefaultForChunkFailure(outcome)) {
      event.preventDefault();
    }
  };

  const handleError = (event: ErrorEvent) => {
    const walletRuntime = getWalletProviderRuntimeSnapshot();
    recoverFromChunkLoadFailure(event.error ?? event.message, {
      routePath: resolveRecoveryRoutePath(window.location.hash),
      policyId: resolveRecoveryPolicyId(resolveRecoveryRoutePath(window.location.hash)),
      walletContextReady: walletRuntime.contextAvailable,
    });
  };

  window.addEventListener("vite:preloadError", handleVitePreloadError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  window.addEventListener("error", handleError);

  return () => {
    window.removeEventListener("vite:preloadError", handleVitePreloadError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("error", handleError);
  };
}
