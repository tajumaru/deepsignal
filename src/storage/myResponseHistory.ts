import { flattenAnswer } from "../lib/utils";
import type { FormField, FormSchema, Submission } from "../types";

const MY_RESPONSE_HISTORY_KEY = "deepsignal.myResponseHistory.v1";

export type MyResponseHistoryStatus = "pending" | "submitted" | "failed" | "local-only";
export type MyResponseHistoryStorageMode = "local" | "uploadRelay" | "walrus";

export interface MyResponseHistoryEntry {
  submissionId: string;
  formId: string;
  formTitle: string;
  projectId?: string;
  projectName?: string;
  submittedAt: string;
  status: MyResponseHistoryStatus;
  storageMode: MyResponseHistoryStorageMode;
  formVersion?: number;
  schemaHash?: string;
  formBlobId?: string;
  manifestBlobId?: string;
  submissionBlobId?: string;
  answerSummary: string;
  answers: Record<string, unknown>;
  fields: FormField[];
  errorMessage?: string;
  hiddenAt?: string;
}

interface BuildMyResponseHistoryEntryArgs {
  form: FormSchema;
  submission: Pick<
    Submission,
    | "id"
    | "formId"
    | "formVersion"
    | "formBlobId"
    | "schemaHash"
    | "manifestBlobId"
    | "projectId"
    | "answers"
    | "createdAt"
    | "respondentMeta"
    | "answerBlobId"
    | "receiptBlobId"
    | "encryptedBlobId"
    | "blobId"
  >;
  status: MyResponseHistoryStatus;
  storageMode: MyResponseHistoryStorageMode;
  errorMessage?: string;
}

interface BuildFailedMyResponseDraftArgs {
  form: FormSchema;
  submissionId: string;
  answers: Record<string, unknown>;
  submittedAt: string;
  status: MyResponseHistoryStatus;
  storageMode: MyResponseHistoryStorageMode;
  errorMessage?: string;
}

function safeReadHistory(): MyResponseHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(MY_RESPONSE_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isMyResponseHistoryEntry) : [];
  } catch (error) {
    console.warn("[my responses] failed to read local history", error);
    return [];
  }
}

function safeWriteHistory(entries: MyResponseHistoryEntry[]) {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.setItem(MY_RESPONSE_HISTORY_KEY, JSON.stringify(entries));
    return true;
  } catch (error) {
    console.warn("[my responses] failed to write local history", error);
    return false;
  }
}

function isMyResponseHistoryEntry(value: unknown): value is MyResponseHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<MyResponseHistoryEntry>;
  return (
    typeof entry.submissionId === "string" &&
    typeof entry.formId === "string" &&
    typeof entry.formTitle === "string" &&
    typeof entry.submittedAt === "string" &&
    isMyResponseHistoryStatus(entry.status) &&
    isMyResponseHistoryStorageMode(entry.storageMode) &&
    typeof entry.answerSummary === "string" &&
    Boolean(entry.answers && typeof entry.answers === "object" && !Array.isArray(entry.answers))
  );
}

function isMyResponseHistoryStatus(value: unknown): value is MyResponseHistoryStatus {
  return value === "pending" || value === "submitted" || value === "failed" || value === "local-only";
}

function isMyResponseHistoryStorageMode(value: unknown): value is MyResponseHistoryStorageMode {
  return value === "local" || value === "uploadRelay" || value === "walrus";
}

function cloneJsonSafe<T>(value: T): T {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, item) => {
        if (typeof File !== "undefined" && item instanceof File) {
          return {
            kind: "file",
            name: item.name,
            size: item.size,
            type: item.type,
          };
        }
        if (typeof Blob !== "undefined" && item instanceof Blob) {
          return {
            kind: "blob",
            size: item.size,
            type: item.type,
          };
        }
        if (typeof item === "function") {
          return undefined;
        }
        return item;
      }),
    );
  } catch {
    return {} as T;
  }
}

function buildAnswerSummary(fields: FormField[], answers: Record<string, unknown>) {
  const fieldLabels = new Map(fields.map((field) => [field.id, field.label]));
  const summary = Object.entries(answers)
    .map(([fieldId, value]) => {
      const text = flattenAnswer(value).trim();
      if (!text) {
        return "";
      }
      return `${fieldLabels.get(fieldId) ?? fieldId}: ${text}`;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
  return summary || "Response saved on this device.";
}

function getSubmissionBlobId(submission: BuildMyResponseHistoryEntryArgs["submission"]) {
  return submission.answerBlobId ?? submission.receiptBlobId ?? submission.encryptedBlobId ?? submission.blobId;
}

export function buildMyResponseHistoryEntry({
  form,
  submission,
  status,
  storageMode,
  errorMessage,
}: BuildMyResponseHistoryEntryArgs): MyResponseHistoryEntry {
  const answers = cloneJsonSafe(submission.answers);
  return {
    submissionId: submission.id,
    formId: submission.formId,
    formTitle: form.title,
    projectId: submission.projectId ?? form.projectId,
    projectName: form.projectName,
    submittedAt: submission.respondentMeta?.submittedAt ?? submission.createdAt,
    status,
    storageMode,
    formVersion: submission.formVersion ?? form.formVersion,
    schemaHash: submission.schemaHash ?? form.schemaHash,
    formBlobId: submission.formBlobId ?? form.blobId,
    manifestBlobId: submission.manifestBlobId ?? form.manifestBlobId,
    submissionBlobId: getSubmissionBlobId(submission),
    answerSummary: buildAnswerSummary(form.fields, answers),
    answers,
    fields: cloneJsonSafe(form.fields),
    errorMessage: errorMessage?.trim() || undefined,
  };
}

export function buildFailedMyResponseDraft({
  form,
  submissionId,
  answers,
  submittedAt,
  status,
  storageMode,
  errorMessage,
}: BuildFailedMyResponseDraftArgs): MyResponseHistoryEntry {
  const safeAnswers = cloneJsonSafe(answers);
  return {
    submissionId,
    formId: form.id,
    formTitle: form.title,
    projectId: form.projectId,
    projectName: form.projectName,
    submittedAt,
    status,
    storageMode,
    formVersion: form.formVersion,
    schemaHash: form.schemaHash,
    formBlobId: form.blobId,
    manifestBlobId: form.manifestBlobId,
    answerSummary: buildAnswerSummary(form.fields, safeAnswers),
    answers: safeAnswers,
    fields: cloneJsonSafe(form.fields),
    errorMessage: errorMessage?.trim() || undefined,
  };
}

export function upsertMyResponseHistoryEntry(entry: MyResponseHistoryEntry) {
  const entries = safeReadHistory();
  const existing = entries.find((item) => item.submissionId === entry.submissionId);
  const nextEntry = existing
    ? {
        ...existing,
        ...entry,
        hiddenAt: existing.hiddenAt,
      }
    : entry;
  const nextEntries = [
    nextEntry,
    ...entries.filter((item) => item.submissionId !== entry.submissionId),
  ].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  return safeWriteHistory(nextEntries);
}

export function listMyResponseHistory({ includeHidden = false }: { includeHidden?: boolean } = {}) {
  return safeReadHistory().filter((entry) => includeHidden || !entry.hiddenAt);
}

export function getMyResponseHistoryEntry(submissionId: string) {
  return listMyResponseHistory().find((entry) => entry.submissionId === submissionId) ?? null;
}

export function hideMyResponseHistoryEntry(submissionId: string) {
  const entries = safeReadHistory();
  let updated = false;
  const hiddenAt = new Date().toISOString();
  const nextEntries = entries.map((entry) => {
    if (entry.submissionId !== submissionId) {
      return entry;
    }
    updated = true;
    return {
      ...entry,
      hiddenAt,
    };
  });
  return updated ? safeWriteHistory(nextEntries) : false;
}
