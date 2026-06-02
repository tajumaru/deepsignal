import type { Submission } from "../types";

export type SystemDiagnosticSeverity = "warning" | "error" | "critical";

export type DiagnosticsRemoteSyncStatus = "remote_synced" | "sync_pending" | "local_only";

export const DEFAULT_DIAGNOSTICS_LIMIT = 50;
export const MAX_DIAGNOSTICS_LIMIT = 500;

export interface SystemDiagnostic {
  id: string;
  createdAt: string;
  updatedAt?: string;
  severity: SystemDiagnosticSeverity;
  fingerprint: string;
  source: "deepsignal-runtime";
  sourceContext?: string;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  routeId: string;
  routePath: string;
  pathname?: string;
  chunkUrl?: string | null;
  buildVersion?: string;
  buildTime?: string;
  gitHash?: string;
  platform?: string;
  mobileSafari?: boolean;
  walrusStorageMode?: string;
  remoteSyncStatus?: DiagnosticsRemoteSyncStatus;
}

export interface DiagnosticsSearchFilters {
  since?: string;
  until?: string;
  severity?: SystemDiagnosticSeverity;
  routeId?: string;
  route?: string;
  buildVersion?: string;
  errorName?: string;
  fingerprint?: string;
  query?: string;
  limit?: number;
  includeStackTraces?: boolean;
}

export type DiagnosticsSource =
  | {
      kind: "localOnly";
    }
  | {
      kind: "adminInboxLoadedRecords";
      submissions?: Submission[];
      records?: Array<{
        submission: Submission;
      }>;
    }
  | {
      kind: "hostedAdminApi";
      endpoint?: string;
    };

export interface DiagnosticsQueryOptions extends DiagnosticsSearchFilters {
  source?: DiagnosticsSource;
}

export type DiagnosticsListOptions = DiagnosticsQueryOptions;

export interface DiagnosticsListResult {
  diagnostics: SystemDiagnostic[];
  total: number;
  totalMatching: number;
  limit: number;
  maxLimit: number;
  truncated: boolean;
}

export interface DiagnosticsExportOptions extends DiagnosticsQueryOptions {
  includeStackTraces?: boolean;
}

export interface DiagnosticsExportEnvelope {
  version: 1;
  exportedAt: string;
  source: "deepsignal-diagnostics-service";
  filters: DiagnosticsSearchFilters;
  count: number;
  totalMatching: number;
  truncated: boolean;
  maxLimit: number;
  diagnostics: SystemDiagnostic[];
}

export interface DiagnosticsSummaryOptions extends DiagnosticsQueryOptions {
  groupBy?: "fingerprint" | "routeId" | "errorName" | "buildVersion";
}

export interface DiagnosticsSummaryGroup {
  key: string;
  count: number;
  severityMax: SystemDiagnosticSeverity;
  firstSeen: string;
  lastSeen: string;
  examples: string[];
}

export interface DiagnosticsSummary {
  total: number;
  totalMatching: number;
  limit: number;
  maxLimit: number;
  truncated: boolean;
  groupBy: NonNullable<DiagnosticsSummaryOptions["groupBy"]>;
  groups: DiagnosticsSummaryGroup[];
  topRoutes: Array<{
    routeId: string;
    count: number;
  }>;
}
