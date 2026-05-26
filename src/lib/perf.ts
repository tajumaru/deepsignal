type PerfStatus = "pending" | "ok" | "failed";

type PerfEntry = {
  name: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: PerfStatus;
  detail?: string;
};

declare global {
  interface Window {
    __DEEPSIGNAL_PERF__?: Record<string, PerfEntry>;
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
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    const suffix = store[name].detail ? ` (${store[name].detail})` : "";
    console.debug(`[DeepSignal perf] ${name}: ${store[name].durationMs}ms [${status}]${suffix}`);
  }
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

  return rows.length > 0 ? rows.join("\n") : "no startup spans recorded";
}

export async function copyPerfDiagnostics(prefixes: string[] = []) {
  const text = formatPerfDiagnostics(prefixes);
  await navigator.clipboard.writeText(text);
  return text;
}
