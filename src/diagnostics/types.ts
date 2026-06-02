export type SystemDiagnosticSeverity = "warning" | "error" | "critical";

export type DiagnosticsRemoteSyncStatus = "remote_synced" | "sync_pending" | "local_only";

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

export interface DiagnosticsListOptions extends DiagnosticsSearchFilters {}

export interface DiagnosticsListResult {
  diagnostics: SystemDiagnostic[];
  total: number;
}

export interface DiagnosticsExportOptions extends DiagnosticsSearchFilters {
  includeStackTraces?: boolean;
}

export interface DiagnosticsExportEnvelope {
  version: 1;
  exportedAt: string;
  source: "deepsignal-diagnostics-service";
  filters: DiagnosticsSearchFilters;
  diagnostics: SystemDiagnostic[];
}

export interface DiagnosticsSummaryOptions extends DiagnosticsSearchFilters {
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
  groupBy: NonNullable<DiagnosticsSummaryOptions["groupBy"]>;
  groups: DiagnosticsSummaryGroup[];
  topRoutes: Array<{
    routeId: string;
    count: number;
  }>;
}
