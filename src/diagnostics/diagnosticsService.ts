import { SYSTEM_SIGNAL_FORM_ID } from "../services/systemSignalReporterHelpers";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { SystemDiagnostic } from "./types";
import type {
  DiagnosticsListOptions,
  DiagnosticsListResult,
  DiagnosticsQueryOptions,
  DiagnosticsSearchFilters,
  DiagnosticsSource,
} from "./types";
import { DEFAULT_DIAGNOSTICS_LIMIT, MAX_DIAGNOSTICS_LIMIT } from "./types";
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

function resolveLimit(limit: number | undefined) {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return DEFAULT_DIAGNOSTICS_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_DIAGNOSTICS_LIMIT);
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
  const limit = resolveLimit(filters.limit);
  const limited = filtered.slice(0, limit);
  return {
    diagnostics: limited,
    totalMatching: filtered.length,
    limit,
    maxLimit: MAX_DIAGNOSTICS_LIMIT,
    truncated: limited.length < filtered.length,
  };
}

function getSourceSubmissions(source: DiagnosticsSource) {
  if (source.kind === "adminInboxLoadedRecords") {
    return [
      ...(source.submissions ?? []),
      ...(source.records ?? []).map((record) => record.submission),
    ];
  }
  return null;
}

async function readDiagnostics(options: DiagnosticsQueryOptions = {}) {
  const source = options.source ?? { kind: "localOnly" };
  if (source.kind === "hostedAdminApi") {
    throw new Error("Hosted diagnostics source is reserved for a future authenticated admin API.");
  }
  const sourceSubmissions = getSourceSubmissions(source);
  if (sourceSubmissions) {
    return redactSystemSignals(sourceSubmissions, {
      includeStackTraces: options.includeStackTraces === true,
    }).sort(byNewest);
  }
  const submissions = await localStorageAdapter.listSubmissions(SYSTEM_SIGNAL_FORM_ID);
  return redactSystemSignals(submissions, {
    includeStackTraces: options.includeStackTraces === true,
  }).sort(byNewest);
}

export async function listDiagnostics(options: DiagnosticsListOptions = {}): Promise<DiagnosticsListResult> {
  const diagnostics = await readDiagnostics(options);
  const filtered = applyFilters(diagnostics, options);
  return {
    diagnostics: filtered.diagnostics,
    total: filtered.diagnostics.length,
    totalMatching: filtered.totalMatching,
    limit: filtered.limit,
    maxLimit: filtered.maxLimit,
    truncated: filtered.truncated,
  };
}

export async function getDiagnostic(
  id: string,
  options: Pick<DiagnosticsQueryOptions, "includeStackTraces" | "source"> = {},
): Promise<SystemDiagnostic | null> {
  const diagnostics = await readDiagnostics({
    ...options,
    includeStackTraces: options.includeStackTraces === true,
  });
  return diagnostics.find((diagnostic) => diagnostic.id === id) ?? null;
}

export async function searchDiagnostics(filters: DiagnosticsQueryOptions): Promise<DiagnosticsListResult> {
  return listDiagnostics(filters);
}
