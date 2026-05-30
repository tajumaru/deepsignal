export type MemoryAdapterKind = "noop";

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
