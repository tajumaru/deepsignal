import { searchDiagnostics } from "./diagnosticsService";
import type {
  DiagnosticsExportEnvelope,
  DiagnosticsExportOptions,
  DiagnosticsSearchFilters,
} from "./types";

function normalizeExportFilters(options: DiagnosticsExportOptions = {}): DiagnosticsSearchFilters {
  return {
    ...options,
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
  const result = await searchDiagnostics(filters);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "deepsignal-diagnostics-service",
    filters,
    diagnostics: result.diagnostics,
  };
}
