import { formatPerfDiagnostics } from "./perf";
import { buildInfo } from "./buildInfo";

type DiagnosticDetails = Record<string, unknown>;
type ReadinessState = Record<string, unknown>;
const SELECTED_PROJECT_ID_KEY = "deepsignal.projectRegistry.selectedProjectId";

export type BrowserCapabilities = {
  mobileSafari?: boolean;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalonePwa?: boolean;
  hasIndexedDB?: boolean;
  hasLocalStorage?: boolean;
  hasCryptoSubtle?: boolean;
  hasBigInt?: boolean;
};

export type ChunkProbe = {
  bodyEmpty?: boolean;
  bodyHash?: string;
  bodyLooksLikeHtml?: boolean;
  contentLength?: string;
  contentType?: string;
  decodedBodySize?: number;
  elapsedMs?: number;
  encodedBodySize?: number;
  initiatorType?: string;
  ok: boolean;
  resourceErrorFired?: boolean;
  resourceTimingExists?: boolean;
  snippet?: string;
  status?: number;
  transferSize?: number;
  truncated?: boolean;
  url: string;
};

export type ChunkDependencyProbe = {
  dependencies: ChunkProbe[];
  failedCount: number;
  parentUrl: string;
  totalCount: number;
};

declare global {
  interface Window {
    __DEEPSIGNAL_ROUTE_EVENTS__?: Array<{
      event: string;
      at: number;
      details?: DiagnosticDetails;
    }>;
    __DEEPSIGNAL_DEBUG__?: {
      providerReadiness: ReadinessState;
      routeTimings: Array<{
        event: string;
        at: number;
        details?: DiagnosticDetails;
      }>;
      hydrationTimings: Array<{
        event: string;
        at: number;
        details?: DiagnosticDetails;
      }>;
      failedImports: Array<{
        at: number;
        label: string;
        message: string;
        chunkUrl?: string | null;
        buildVersion?: string;
        buildTime?: string;
        gitHash?: string;
        attempt?: number;
        routePath?: string;
        routeId?: string;
        elapsedMs?: number;
        userAgent?: string;
        mobileSafari?: boolean;
        currentUrl?: string;
        pathname?: string;
        hash?: string;
        category?: "chunkLoad" | "missingExport" | "runtime" | "timeout";
        expectedExport?: string;
        availableExports?: string[];
        moduleKeys?: string[];
        resolvedExport?: "default" | string | "missing";
        dependencyProbe?: ChunkDependencyProbe;
        probe?: ChunkProbe;
      }>;
      runtimeErrors: Array<{
        at: number;
        sourceContext: string;
        errorName: string;
        errorMessage: string;
        errorStack?: string;
        routePath: string;
        details?: DiagnosticDetails;
      }>;
      resourceErrors: Array<{
        at: number;
        sourceContext: string;
        tagName: string;
        src?: string;
        href?: string;
        rel?: string;
        as?: string;
        crossOrigin?: string | null;
        routePath: string;
        details?: DiagnosticDetails;
      }>;
      currentProjectId: string;
      cacheRestoreSource: string;
      browserCapabilities: ReadinessState;
      updatedAt: string;
    };
  }
}

function sanitizeDetails(details?: DiagnosticDetails) {
  if (!details) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      value instanceof Error
        ? {
            name: value.name,
            message: value.message,
            stack: value.stack,
          }
        : value,
    ]),
  );
}

export function logRouteLifecycle(event: string, details?: DiagnosticDetails) {
  if (typeof window === "undefined") {
    return;
  }

  const entry = {
    event,
    at: Math.round(performance.now()),
    details: sanitizeDetails(details),
  };
  window.__DEEPSIGNAL_ROUTE_EVENTS__ ??= [];
  window.__DEEPSIGNAL_ROUTE_EVENTS__.push(entry);
  if (window.__DEEPSIGNAL_ROUTE_EVENTS__.length > 60) {
    window.__DEEPSIGNAL_ROUTE_EVENTS__.shift();
  }
  updateDeepSignalDebug(event.includes("hydration") ? "hydrationTimings" : "routeTimings", entry);
  console.info("[DeepSignal route]", entry);
}

function getDebugState() {
  window.__DEEPSIGNAL_DEBUG__ ??= {
    providerReadiness: {},
    routeTimings: [],
    hydrationTimings: [],
    failedImports: [],
    runtimeErrors: [],
    resourceErrors: [],
    currentProjectId: "",
    cacheRestoreSource: "unknown",
    browserCapabilities: {},
    updatedAt: new Date().toISOString(),
  };
  window.__DEEPSIGNAL_DEBUG__.providerReadiness ??= {};
  window.__DEEPSIGNAL_DEBUG__.routeTimings ??= [];
  window.__DEEPSIGNAL_DEBUG__.hydrationTimings ??= [];
  window.__DEEPSIGNAL_DEBUG__.failedImports ??= [];
  window.__DEEPSIGNAL_DEBUG__.runtimeErrors ??= [];
  window.__DEEPSIGNAL_DEBUG__.resourceErrors ??= [];
  window.__DEEPSIGNAL_DEBUG__.currentProjectId ??= "";
  window.__DEEPSIGNAL_DEBUG__.cacheRestoreSource ??= "unknown";
  window.__DEEPSIGNAL_DEBUG__.browserCapabilities ??= {};
  window.__DEEPSIGNAL_DEBUG__.updatedAt ??= new Date().toISOString();
  return window.__DEEPSIGNAL_DEBUG__;
}

export function getCurrentRoutePath() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.hash?.replace(/^#/, "") || `${window.location.pathname}${window.location.search}`;
}

export function isMobileSafariLike(userAgent: string, platform = "", maxTouchPoints = 0) {
  const isIosDevice =
    /iP(?:hone|ad|od)/i.test(userAgent) ||
    /iP(?:hone|ad|od)/i.test(platform) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  const isWebKit = /AppleWebKit/i.test(userAgent);
  const isExcludedChromiumOrFirefox = /CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Firefox/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) || !/Version\/[\d.]+/i.test(userAgent);
  const isWalletInAppBrowser = /Slush|Sui|Wallet|Mobile\/\w+/i.test(userAgent);
  return Boolean(isIosDevice && isWebKit && (isSafari || isWalletInAppBrowser) && !isExcludedChromiumOrFirefox);
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  if (typeof navigator === "undefined") {
    return {};
  }

  return {
    mobileSafari: isMobileSafariLike(navigator.userAgent || "", navigator.platform || "", navigator.maxTouchPoints ?? 0),
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalonePwa:
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches,
    hasIndexedDB: typeof indexedDB !== "undefined",
    hasLocalStorage: typeof window !== "undefined" && "localStorage" in window,
    hasCryptoSubtle: typeof crypto !== "undefined" && Boolean(crypto.subtle),
    hasBigInt: typeof BigInt !== "undefined",
  };
}

export function getBrowserCapabilitiesSnapshot(): BrowserCapabilities {
  if (typeof window === "undefined") {
    return detectBrowserCapabilities();
  }

  const state = getDebugState();
  const snapshot = state.browserCapabilities as BrowserCapabilities;
  if (typeof snapshot.mobileSafari === "boolean" && typeof snapshot.userAgent === "string" && snapshot.userAgent.length > 0) {
    return snapshot;
  }

  const detected = detectBrowserCapabilities();
  setDeepSignalBrowserCapabilities(detected);
  return {
    ...snapshot,
    ...detected,
  };
}

export function isMobileSafariRuntime() {
  return Boolean(getBrowserCapabilitiesSnapshot().mobileSafari);
}

export function updateBrowserCapabilityDiagnostics() {
  const capabilities = detectBrowserCapabilities();
  if (Object.keys(capabilities).length === 0) {
    return;
  }
  setDeepSignalBrowserCapabilities(capabilities);
}

function updateDeepSignalDebug(
  key: "routeTimings" | "hydrationTimings",
  entry: { event: string; at: number; details?: DiagnosticDetails },
) {
  const state = getDebugState();
  state[key].push(entry);
  if (state[key].length > 80) {
    state[key].shift();
  }
  state.currentProjectId = readSelectedProjectId();
  state.updatedAt = new Date().toISOString();
}

function readSelectedProjectId() {
  try {
    return window.localStorage.getItem(SELECTED_PROJECT_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDeepSignalDebugReadiness(details: ReadinessState) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  state.providerReadiness = {
    ...state.providerReadiness,
    ...sanitizeDetails(details),
  };
  state.currentProjectId = readSelectedProjectId();
  state.updatedAt = new Date().toISOString();
}

export function setDeepSignalCacheRestoreSource(source: string) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  state.cacheRestoreSource = source;
  state.currentProjectId = readSelectedProjectId();
  state.updatedAt = new Date().toISOString();
}

export function setDeepSignalBrowserCapabilities(details: ReadinessState) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  state.browserCapabilities = {
    ...state.browserCapabilities,
    ...sanitizeDetails(details),
  };
  state.currentProjectId = readSelectedProjectId();
  state.updatedAt = new Date().toISOString();
}

export function recordFailedImport(
  label: string,
  error: unknown,
  chunkUrl?: string | null,
  details?: {
    category?: "chunkLoad" | "missingExport" | "runtime" | "timeout";
    attempt?: number;
    routePath?: string;
    routeId?: string;
    elapsedMs?: number;
    userAgent?: string;
    mobileSafari?: boolean;
    currentUrl?: string;
    pathname?: string;
    hash?: string;
    expectedExport?: string;
    availableExports?: string[];
    moduleKeys?: string[];
    resolvedExport?: "default" | string | "missing";
  },
) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  state.failedImports.push({
    at: Math.round(performance.now()),
    label,
    message: error instanceof Error ? error.message : String(error ?? "unknown"),
    chunkUrl,
    buildVersion: buildInfo.appVersion,
    buildTime: buildInfo.buildTime,
    gitHash: buildInfo.gitHash,
    ...details,
  });
  if (state.failedImports.length > 40) {
    state.failedImports.shift();
  }
  state.updatedAt = new Date().toISOString();
}

export function recordFailedImportProbe(
  label: string,
  probe: ChunkProbe,
) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  for (let index = state.failedImports.length - 1; index >= 0; index -= 1) {
    if (state.failedImports[index].label === label) {
      state.failedImports[index].probe = probe;
      break;
    }
  }
  state.updatedAt = new Date().toISOString();
}

export function recordFailedImportDependencyProbe(label: string, dependencyProbe: ChunkDependencyProbe) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  for (let index = state.failedImports.length - 1; index >= 0; index -= 1) {
    if (state.failedImports[index].label === label) {
      state.failedImports[index].dependencyProbe = dependencyProbe;
      break;
    }
  }
  state.updatedAt = new Date().toISOString();
}

export function recordRuntimeErrorDiagnostic({
  sourceContext,
  errorName,
  errorMessage,
  errorStack,
  details,
}: {
  sourceContext: string;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  details?: DiagnosticDetails;
}) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  state.runtimeErrors.push({
    at: Math.round(performance.now()),
    sourceContext,
    errorName,
    errorMessage,
    errorStack,
    routePath: getCurrentRoutePath(),
    details: sanitizeDetails(details),
  });
  if (state.runtimeErrors.length > 40) {
    state.runtimeErrors.shift();
  }
  state.updatedAt = new Date().toISOString();
}

export function recordResourceErrorDiagnostic({
  sourceContext,
  tagName,
  src,
  href,
  rel,
  as,
  crossOrigin,
  details,
}: {
  sourceContext: string;
  tagName: string;
  src?: string;
  href?: string;
  rel?: string;
  as?: string;
  crossOrigin?: string | null;
  details?: DiagnosticDetails;
}) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  state.resourceErrors.push({
    at: Math.round(performance.now()),
    sourceContext,
    tagName,
    src,
    href,
    rel,
    as,
    crossOrigin,
    routePath: getCurrentRoutePath(),
    details: sanitizeDetails(details),
  });
  if (state.resourceErrors.length > 40) {
    state.resourceErrors.shift();
  }
  state.updatedAt = new Date().toISOString();
}

export function hasResourceErrorForUrl(url: string) {
  if (typeof window === "undefined") {
    return false;
  }
  const target = url.split("#")[0];
  const withoutQuery = target.split("?")[0];
  const state = getDebugState();
  return state.resourceErrors.some((entry) => {
    const candidate = entry.src ?? entry.href ?? "";
    if (!candidate) {
      return false;
    }
    const normalized = candidate.split("#")[0];
    return normalized === target || normalized.split("?")[0] === withoutQuery;
  });
}

export function formatRouteLifecycleDiagnostics() {
  if (typeof window === "undefined") {
    return "route diagnostics unavailable";
  }

  const routeRows = (window.__DEEPSIGNAL_ROUTE_EVENTS__ ?? [])
    .map((entry) => {
      const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
      return `${entry.at}ms ${entry.event}${details}`;
    })
    .join("\n");
  const perfRows = formatPerfDiagnostics(["app:", "lazy:", "route:", "explore:", "wallet:", "admin:", "public-form:"]);
  const debugRows = window.__DEEPSIGNAL_DEBUG__ ? JSON.stringify(window.__DEEPSIGNAL_DEBUG__, null, 2) : "debug snapshot unavailable";
  return [routeRows || "no route lifecycle events recorded", perfRows, debugRows].join("\n\n");
}
