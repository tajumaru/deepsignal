export type MemoryAdapterKind = "noop";

export type SignalPatternMemoryType =
  | "system_diagnostic_pattern"
  | "user_feedback_pattern"
  | "product_request_pattern"
  | "ux_friction_pattern"
  | "operational_fix_pattern";

export type SignalKind =
  | "user_signal"
  | "system_signal"
  | "diagnostics_summary_group"
  | "admin_review"
  | "codex_operation"
  | "product_insight";

export type SignalPatternMemoryStatus =
  | "draft"
  | "active"
  | "watching"
  | "investigating"
  | "mitigated"
  | "confirmed_fixed"
  | "stale"
  | "revoked";

export type SignalPatternMemoryConfidence = "low" | "medium" | "high";

export type SignalPatternMemoryFrequency = {
  count: number;
  window?: "24h" | "7d" | "30d" | "all_time";
  trend?: "new" | "increasing" | "stable" | "decreasing" | "resolved";
};

export type SignalPatternMemoryFix = {
  summary: string;
  attemptedAt?: string;
  confirmedAt?: string;
  affectedBuilds?: string[];
  fixedBuilds?: string[];
  outcome?: string;
  verification?: string;
};

export type SignalPatternMemoryDraft = {
  schemaVersion: "deepsignal.signal_pattern_memory.v1";
  type: SignalPatternMemoryType;
  title: string;
  summary: string;
  signalKinds: SignalKind[];
  sourceSignalIds: string[];
  fingerprints: string[];
  tags: string[];
  affectedRoutes: string[];
  affectedBuilds: string[];
  platforms: string[];
  frequency: SignalPatternMemoryFrequency;
  firstSeen: string;
  lastSeen: string;
  status: SignalPatternMemoryStatus;
  confidence: SignalPatternMemoryConfidence;
  evidenceSummary: string[];
  recommendedAction?: string;
  recommendedCodexPrompt?: string;
  failedFixes: SignalPatternMemoryFix[];
  confirmedFixes: SignalPatternMemoryFix[];
};

export type SignalPatternMemory = Omit<SignalPatternMemoryDraft, "status"> & {
  memoryId: string;
  status: SignalPatternMemoryStatus;
  createdAt: string;
  updatedAt: string;
};

export type SignalMemoryProvider = "none" | "memory" | "memwal";

export type SignalMemoryAdapterKind = "noop" | "memory" | "memwal-placeholder";

export type SignalMemorySearchOptions = {
  limit?: number;
  type?: SignalPatternMemoryType;
  tags?: string[];
  status?: SignalPatternMemoryStatus;
};

export type SignalMemoryWriteResult = {
  ok: boolean;
  skipped: boolean;
  reason?: "noop" | "memwal_not_implemented";
  memoryId?: string;
};

export type SignalPatternMemoryPatch = Partial<
  Pick<
    SignalPatternMemory,
    | "status"
    | "confidence"
    | "recommendedAction"
    | "recommendedCodexPrompt"
    | "failedFixes"
    | "confirmedFixes"
  >
>;

export type SignalMemorySearchResult = {
  memories: SignalPatternMemory[];
  total: number;
  skipped: boolean;
  reason?: "noop" | "memwal_not_implemented";
};

export interface SignalMemoryAdapter {
  readonly kind: SignalMemoryAdapterKind;
  listMemories(namespace: string): Promise<SignalPatternMemory[]>;
  getMemory(namespace: string, memoryId: string): Promise<SignalPatternMemory | null>;
  saveMemory(namespace: string, memory: SignalPatternMemory): Promise<SignalMemoryWriteResult>;
  updateMemory(namespace: string, memoryId: string, patch: SignalPatternMemoryPatch): Promise<SignalMemoryWriteResult>;
  searchMemories(
    namespace: string,
    query: string,
    options?: SignalMemorySearchOptions,
  ): Promise<SignalMemorySearchResult>;
}

export type MemoryRuntimeStatus = {
  kind: MemoryAdapterKind;
  enabled: boolean;
  configured: boolean;
  reason: "disabled";
};

export type ReviewMemoryRecord = {
  projectId?: string;
  formId: string;
  submissionId: string;
  summary: string;
  evidence: string[];
  reviewedAt: string;
};

export type ReviewMemoryRecallQuery = {
  projectId?: string;
  formId: string;
  submissionId: string;
  query: string;
};

export type ReviewMemoryMatch = {
  id: string;
  summary: string;
  evidence: string[];
  relevance: number;
  sourceSubmissionId?: string;
};

export type MemoryWriteResult = {
  ok: false;
  skipped: true;
  reason: "disabled";
};

export type MemoryRecallResult = {
  ok: false;
  skipped: true;
  reason: "disabled";
  matches: ReviewMemoryMatch[];
};

export interface MemoryAdapter {
  readonly kind: MemoryAdapterKind;
  getRuntimeStatus(): MemoryRuntimeStatus;
  rememberReviewMemory(record: ReviewMemoryRecord): Promise<MemoryWriteResult>;
  recallReviewMemory(query: ReviewMemoryRecallQuery): Promise<MemoryRecallResult>;
}
