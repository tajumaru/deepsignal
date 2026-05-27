import { formatPerfDiagnostics } from "./perf";
import { getSelectedProjectId } from "./projectRegistry";

type DiagnosticDetails = Record<string, unknown>;
type ReadinessState = Record<string, unknown>;

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
    currentProjectId: "",
    cacheRestoreSource: "unknown",
    browserCapabilities: {},
    updatedAt: new Date().toISOString(),
  };
  return window.__DEEPSIGNAL_DEBUG__;
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
  state.currentProjectId = getSelectedProjectId();
  state.updatedAt = new Date().toISOString();
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
  state.currentProjectId = getSelectedProjectId();
  state.updatedAt = new Date().toISOString();
}

export function setDeepSignalCacheRestoreSource(source: string) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  state.cacheRestoreSource = source;
  state.currentProjectId = getSelectedProjectId();
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
  state.currentProjectId = getSelectedProjectId();
  state.updatedAt = new Date().toISOString();
}

export function recordFailedImport(label: string, error: unknown, chunkUrl?: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  const state = getDebugState();
  state.failedImports.push({
    at: Math.round(performance.now()),
    label,
    message: error instanceof Error ? error.message : String(error ?? "unknown"),
    chunkUrl,
  });
  if (state.failedImports.length > 40) {
    state.failedImports.shift();
  }
  state.updatedAt = new Date().toISOString();
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
