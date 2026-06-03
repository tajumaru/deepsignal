type PerfStatus = "pending" | "ok" | "failed";

type PerfEntry = {
  name: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: PerfStatus;
  detail?: string;
};

type PerfMilestone = {
  name: string;
  at: number;
  detail?: string;
};

const routeMilestoneNames = new Set(["route_ready", "route:interactive", "workspace:ready"]);
const recordedRouteMilestones = new Set<string>();

declare global {
  interface Window {
    __DEEPSIGNAL_PERF__?: Record<string, PerfEntry>;
    __DEEPSIGNAL_PERF_MILESTONES__?: PerfMilestone[];
  }
}

function getPerfStore() {
  if (typeof window === "undefined") {
    return null;
  }
  window.__DEEPSIGNAL_PERF__ ??= {};
  return window.__DEEPSIGNAL_PERF__;
}

function roundMs(value: number) {
  return Math.max(0, Math.round(value));
}

function syncDebugPerformance() {
  if (typeof window === "undefined") {
    return;
  }
  const debugWindow = window as unknown as {
    __DEEPSIGNAL_DEBUG__?: Record<string, unknown>;
  };
  const debugState = debugWindow.__DEEPSIGNAL_DEBUG__ ?? {};
  debugWindow.__DEEPSIGNAL_DEBUG__ = debugState;
  debugState.performance = {
    spans: window.__DEEPSIGNAL_PERF__ ?? {},
    milestones: window.__DEEPSIGNAL_PERF_MILESTONES__ ?? [],
  };
  debugState.updatedAt = new Date().toISOString();
}

export function startPerf(name: string, detail?: string) {
  const store = getPerfStore();
  if (!store) {
    return;
  }
  performance.mark(`${name}:start`);
  store[name] = {
    name,
    startedAt: performance.now(),
    status: "pending",
    detail,
  };
  syncDebugPerformance();
}

export function endPerf(name: string, status: PerfStatus = "ok", detail?: string) {
  const store = getPerfStore();
  if (!store) {
    return;
  }
  const current = store[name];
  if (!current) {
    performance.mark(`${name}:end`);
    store[name] = {
      name,
      startedAt: performance.now(),
      endedAt: performance.now(),
      durationMs: 0,
      status,
      detail,
    };
    syncDebugPerformance();
    if (typeof console !== "undefined" && typeof console.debug === "function") {
      const suffix = detail ? ` (${detail})` : "";
      console.debug(`[DeepSignal perf] ${name}: 0ms [${status}]${suffix}`);
    }
    return;
  }
  const endedAt = performance.now();
  const startMark = `${name}:start`;
  const endMark = `${name}:end`;
  performance.mark(endMark);
  try {
    performance.measure(name, startMark, endMark);
  } catch {
    // The in-memory diagnostics remain available even if a browser clears marks.
  }
  store[name] = {
    ...current,
    endedAt,
    durationMs: roundMs(endedAt - current.startedAt),
    status,
    detail: detail ?? current.detail,
  };
  syncDebugPerformance();
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    const suffix = store[name].detail ? ` (${store[name].detail})` : "";
    console.debug(`[DeepSignal perf] ${name}: ${store[name].durationMs}ms [${status}]${suffix}`);
  }
}

export function markPerfMilestone(name: string, detail?: string) {
  if (typeof window === "undefined") {
    return;
  }
  if (routeMilestoneNames.has(name)) {
    const key = `${name}:${detail ?? ""}`;
    if (recordedRouteMilestones.has(key)) {
      return;
    }
    recordedRouteMilestones.add(key);
    if (recordedRouteMilestones.size > 120) {
      const oldest = recordedRouteMilestones.values().next().value;
      if (oldest) {
        recordedRouteMilestones.delete(oldest);
      }
    }
  }
  const milestone = {
    name,
    at: roundMs(performance.now()),
    detail,
  };
  window.__DEEPSIGNAL_PERF_MILESTONES__ ??= [];
  window.__DEEPSIGNAL_PERF_MILESTONES__.push(milestone);
  if (window.__DEEPSIGNAL_PERF_MILESTONES__.length > 80) {
    window.__DEEPSIGNAL_PERF_MILESTONES__.shift();
  }
  performance.mark(name);
  syncDebugPerformance();
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    const suffix = detail ? ` (${detail})` : "";
    console.debug(`[DeepSignal perf] ${name}: ${milestone.at}ms${suffix}`);
  }
}

export function startFirstPaintInstrumentation() {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let observer: PerformanceObserver | null = null;
  let rafHandle = 0;

  const paintEntries = performance.getEntriesByType("paint");
  for (const entry of paintEntries) {
    markPerfMilestone(`paint:${entry.name}`, `${Math.round(entry.startTime)}ms`);
  }

  if ("PerformanceObserver" in window) {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          markPerfMilestone(`paint:${entry.name}`, `${Math.round(entry.startTime)}ms`);
        }
      });
      observer.observe({ type: "paint", buffered: true });
    } catch {
      observer = null;
    }
  }

  rafHandle = window.requestAnimationFrame(() => {
    markPerfMilestone("paint:first-frame");
  });

  return () => {
    observer?.disconnect();
    window.cancelAnimationFrame(rafHandle);
  };
}

export async function measurePerf<T>(name: string, task: () => Promise<T>, detail?: string): Promise<T> {
  startPerf(name, detail);
  try {
    const result = await task();
    endPerf(name, "ok");
    return result;
  } catch (error) {
    endPerf(name, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export function formatPerfDiagnostics(prefixes: string[] = []) {
  const store = getPerfStore();
  if (!store) {
    return "performance diagnostics unavailable";
  }

  const rows = Object.values(store)
    .filter((entry) => prefixes.length === 0 || prefixes.some((prefix) => entry.name.startsWith(prefix)))
    .sort((left, right) => left.startedAt - right.startedAt)
    .map((entry) => {
      const duration = entry.durationMs ?? roundMs(performance.now() - entry.startedAt);
      const suffix = entry.detail ? ` (${entry.detail})` : "";
      return `${entry.name}: ${duration}ms [${entry.status}]${suffix}`;
    });

  const milestoneRows = (window.__DEEPSIGNAL_PERF_MILESTONES__ ?? []).map((entry) => {
    const suffix = entry.detail ? ` (${entry.detail})` : "";
    return `${entry.name}: ${entry.at}ms${suffix}`;
  });
  const spanText = rows.length > 0 ? rows.join("\n") : "no startup spans recorded";
  return [spanText, milestoneRows.length > 0 ? milestoneRows.join("\n") : "no startup milestones recorded"].join("\n\n");
}

export async function copyPerfDiagnostics(prefixes: string[] = []) {
  const text = formatPerfDiagnostics(prefixes);
  await navigator.clipboard.writeText(text);
  return text;
}
