import type { FormSchema, Submission } from "../types";

export type MemoryRuntimeMode = "disabled";

export type MemoryRuntimeStatus = {
  mode: MemoryRuntimeMode;
  enabled: false;
  notice: string;
  configured: false;
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
  form: Pick<FormSchema, "id" | "projectId" | "title">;
  submission: Pick<
    Submission,
    "id" | "projectId" | "formId" | "subjectPreview" | "aiSummary" | "keywords" | "tags" | "triageStatus" | "priority"
  >;
};

export type ReviewMemoryMatch = {
  id: string;
  summary: string;
  evidence: string[];
  relevance: number;
  sourceSubmissionId?: string;
};

export type MemoryWriteResult = {
  status: "skipped";
  reason: "disabled";
};

export type MemoryRecallResult = {
  status: "skipped";
  reason: "disabled";
  matches: ReviewMemoryMatch[];
};

export interface MemoryAdapter {
  getRuntimeStatus(): MemoryRuntimeStatus;
  rememberReviewMemory(record: ReviewMemoryRecord): Promise<MemoryWriteResult>;
  recallReviewMemory(query: ReviewMemoryRecallQuery): Promise<MemoryRecallResult>;
}
