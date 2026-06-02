import { SYSTEM_SIGNAL_FORM_ID } from "../services/systemSignalReporter";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { SystemDiagnostic } from "./types";
import type {
  DiagnosticsListOptions,
  DiagnosticsListResult,
  DiagnosticsSearchFilters,
} from "./types";
import { redactSystemSignals } from "./redaction";

function byNewest(left: SystemDiagnostic, right: SystemDiagnostic) {
  return right.createdAt.localeCompare(left.createdAt);
}

function matchesTimeRange(diagnostic: SystemDiagnostic, filters: DiagnosticsSearchFilters) {
  if (filters.since && diagnostic.createdAt < filters.since) {
    return false;
  }
  if (filters.until && diagnostic.createdAt > filters.until) {
    return false;
  }
  return true;
}

function matchesQuery(diagnostic: SystemDiagnostic, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [
    diagnostic.id,
    diagnostic.fingerprint,
    diagnostic.errorName,
    diagnostic.errorMessage,
    diagnostic.routeId,
    diagnostic.routePath,
    diagnostic.buildVersion,
    diagnostic.sourceContext,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function applyFilters(diagnostics: SystemDiagnostic[], filters: DiagnosticsSearchFilters) {
  const filtered = diagnostics.filter((diagnostic) => {
    if (!matchesTimeRange(diagnostic, filters)) return false;
    if (filters.severity && diagnostic.severity !== filters.severity) return false;
    if (filters.routeId && diagnostic.routeId !== filters.routeId) return false;
    if (filters.route && !diagnostic.routePath.includes(filters.route)) return false;
    if (filters.buildVersion && diagnostic.buildVersion !== filters.buildVersion) return false;
    if (filters.errorName && diagnostic.errorName !== filters.errorName) return false;
    if (filters.fingerprint && diagnostic.fingerprint !== filters.fingerprint) return false;
    if (filters.query && !matchesQuery(diagnostic, filters.query)) return false;
    return true;
  });
  const limit = Number.isFinite(filters.limit) && filters.limit && filters.limit > 0
    ? Math.floor(filters.limit)
    : filtered.length;
  return filtered.slice(0, limit);
}

async function readDiagnostics(filters: DiagnosticsSearchFilters = {}) {
  const submissions = await localStorageAdapter.listSubmissions(SYSTEM_SIGNAL_FORM_ID);
  return redactSystemSignals(submissions, {
    includeStackTraces: filters.includeStackTraces,
  }).sort(byNewest);
}

export async function listDiagnostics(options: DiagnosticsListOptions = {}): Promise<DiagnosticsListResult> {
  const diagnostics = await readDiagnostics(options);
  const filtered = applyFilters(diagnostics, options);
  return {
    diagnostics: filtered,
    total: filtered.length,
  };
}

export async function getDiagnostic(id: string): Promise<SystemDiagnostic | null> {
  const diagnostics = await readDiagnostics({ includeStackTraces: true });
  return diagnostics.find((diagnostic) => diagnostic.id === id) ?? null;
}

export async function searchDiagnostics(filters: DiagnosticsSearchFilters): Promise<DiagnosticsListResult> {
  return listDiagnostics(filters);
}
