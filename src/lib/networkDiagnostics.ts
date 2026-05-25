export type NetworkDiagnosticState = "checking" | "online" | "offline" | "unconfigured";
export type OverallNetworkState = "checking" | "online" | "degraded" | "offline" | "unconfigured";

export interface NetworkDiagnosticEntry {
  key: string;
  label: string;
  state: NetworkDiagnosticState;
  url?: string | null;
  latencyMs?: number | null;
  statusCode?: number | null;
  detail?: string | null;
  error?: string | null;
}

export function getNetworkDiagnosticLabel(state: NetworkDiagnosticState) {
  switch (state) {
    case "online":
      return "online";
    case "offline":
      return "offline";
    case "unconfigured":
      return "unconfigured";
    default:
      return "checking";
  }
}

export function getNetworkDiagnosticChipClass(state: NetworkDiagnosticState) {
  if (state === "online") {
    return "signal-chip-accent";
  }
  if (state === "offline") {
    return "signal-chip-warn";
  }
  return "signal-chip-soft";
}

export function formatDiagnosticLatency(latencyMs?: number | null) {
  return typeof latencyMs === "number" && Number.isFinite(latencyMs) ? `${latencyMs} ms` : null;
}

export function formatNetworkDiagnosticDetail(entry: NetworkDiagnosticEntry) {
  const parts = [
    formatDiagnosticLatency(entry.latencyMs),
    typeof entry.statusCode === "number" ? `HTTP ${entry.statusCode}` : null,
    entry.detail?.trim() || null,
    entry.error?.trim() || null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function getOverallNetworkState(entries: NetworkDiagnosticEntry[]): OverallNetworkState {
  const configuredEntries = entries.filter((entry) => entry.state !== "unconfigured");
  if (configuredEntries.length === 0) {
    return "unconfigured";
  }
  if (configuredEntries.some((entry) => entry.state === "checking")) {
    return "checking";
  }
  if (configuredEntries.every((entry) => entry.state === "online")) {
    return "online";
  }
  if (configuredEntries.some((entry) => entry.state === "online")) {
    return "degraded";
  }
  return "offline" as const;
}

export function getOverallNetworkLabel(entries: NetworkDiagnosticEntry[]) {
  const state = getOverallNetworkState(entries);
  switch (state) {
    case "online":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "offline":
      return "Offline";
    case "unconfigured":
      return "Config missing";
    default:
      return "Checking";
  }
}

export function getOverallNetworkChipClass(state: OverallNetworkState) {
  switch (state) {
    case "online":
      return "signal-chip-accent";
    case "degraded":
      return "signal-chip-soft";
    case "offline":
      return "signal-chip-warn";
    default:
      return "signal-chip-soft";
  }
}

export function describeNetworkError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message ? `${error.name}: ${message}` : error.name;
  }
  return String(error);
}

export function buildNetworkDiagnosticsCopy(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2);
}
