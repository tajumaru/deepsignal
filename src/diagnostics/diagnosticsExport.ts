import { searchDiagnostics } from "./diagnosticsService";
import type {
  DiagnosticsExportEnvelope,
  DiagnosticsExportOptions,
  DiagnosticsSearchFilters,
} from "./types";

function normalizeExportFilters(options: DiagnosticsExportOptions = {}): DiagnosticsSearchFilters {
  return {
    since: options.since,
    until: options.until,
    severity: options.severity,
    routeId: options.routeId,
    route: options.route,
    buildVersion: options.buildVersion,
    errorName: options.errorName,
    fingerprint: options.fingerprint,
    query: options.query,
    limit: options.limit,
    includeStackTraces: options.includeStackTraces === true,
  };
}

export function createDiagnosticsExportFilename(timestamp = new Date()) {
  const stamp = timestamp.toISOString().replace(/[:.]/g, "-");
  return `deepsignal-system-diagnostics-${stamp}.json`;
}

export async function exportDiagnosticsJson(
  options: DiagnosticsExportOptions = {},
): Promise<DiagnosticsExportEnvelope> {
  const filters = normalizeExportFilters(options);
  const result = await searchDiagnostics({
    ...options,
    includeStackTraces: options.includeStackTraces === true,
  });
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "deepsignal-diagnostics-service",
    filters,
    count: result.diagnostics.length,
    totalMatching: result.totalMatching,
    truncated: result.truncated,
    maxLimit: result.maxLimit,
    diagnostics: result.diagnostics,
  };
}
