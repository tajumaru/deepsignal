import { flattenAnswer } from "../lib/utils";
import type { FormField, FormSchema, Submission, SubmissionTriageStatus } from "../types";

const MY_RESPONSE_HISTORY_KEY = "deepsignal.myResponseHistory.v1";

export type MyResponseHistoryStatus = "pending" | "submitted" | "failed" | "local-only";
export type MyResponseHistoryStorageMode = "local" | "uploadRelay" | "walrus";
export type MyResponseReviewStatus = Submission["status"];
export type MyResponseLifecycleEventSource = "sender" | "admin" | "sync";
export type MyResponseLifecycleStatus =
  | "submitted"
  | "received"
  | "reviewing"
  | "planned"
  | "in_progress"
  | "completed"
  | "closed";
export type MyResponseRoadmapStatus = Extract<SubmissionTriageStatus, "planned" | "in_progress" | "fixed">;

export interface MyResponseLifecycleEvent {
  status: MyResponseLifecycleStatus;
  at: string;
  source: MyResponseLifecycleEventSource;
  reviewStatus?: MyResponseReviewStatus;
  triageStatus?: SubmissionTriageStatus;
  roadmapStatus?: MyResponseRoadmapStatus;
}

export interface MyResponseHistoryEntry {
  submissionId: string;
  formId: string;
  formTitle: string;
  projectId?: string;
  projectName?: string;
  submittedAt: string;
  status: MyResponseHistoryStatus;
  storageMode: MyResponseHistoryStorageMode;
  lifecycleStatus?: MyResponseLifecycleStatus;
  reviewStatus?: MyResponseReviewStatus;
  triageStatus?: SubmissionTriageStatus;
  roadmapStatus?: MyResponseRoadmapStatus;
  lifecycleUpdatedAt?: string;
  lifecycleEvents?: MyResponseLifecycleEvent[];
  formVersion?: number;
  schemaHash?: string;
  formBlobId?: string;
  manifestBlobId?: string;
  submissionBlobId?: string;
  encrypted?: boolean;
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
    | "isEncrypted"
    | "blobId"
    | "status"
    | "triageStatus"
    | "updatedAt"
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
    return Array.isArray(parsed) ? parsed.filter(isMyResponseHistoryEntry).map(normalizeMyResponseHistoryEntry) : [];
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

function isSubmissionReviewStatus(value: unknown): value is MyResponseReviewStatus {
  return value === "unread" || value === "read" || value === "archived";
}

function isSubmissionTriageStatus(value: unknown): value is SubmissionTriageStatus {
  return (
    value === "new" ||
    value === "investigating" ||
    value === "planned" ||
    value === "in_progress" ||
    value === "fixed" ||
    value === "closed"
  );
}

function isMyResponseLifecycleStatus(value: unknown): value is MyResponseLifecycleStatus {
  return (
    value === "submitted" ||
    value === "received" ||
    value === "reviewing" ||
    value === "planned" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "closed"
  );
}

function isMyResponseLifecycleEventSource(value: unknown): value is MyResponseLifecycleEventSource {
  return value === "sender" || value === "admin" || value === "sync";
}

function isMyResponseLifecycleEvent(value: unknown): value is MyResponseLifecycleEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<MyResponseLifecycleEvent>;
  return (
    isMyResponseLifecycleStatus(event.status) &&
    typeof event.at === "string" &&
    isMyResponseLifecycleEventSource(event.source) &&
    (event.reviewStatus === undefined || isSubmissionReviewStatus(event.reviewStatus)) &&
    (event.triageStatus === undefined || isSubmissionTriageStatus(event.triageStatus))
  );
}

function getRoadmapStatus(triageStatus: SubmissionTriageStatus | undefined): MyResponseRoadmapStatus | undefined {
  if (triageStatus === "planned" || triageStatus === "in_progress" || triageStatus === "fixed") {
    return triageStatus;
  }
  return undefined;
}

function buildLifecycleEvent({
  status,
  at,
  source,
  reviewStatus,
  triageStatus,
  roadmapStatus,
}: MyResponseLifecycleEvent): MyResponseLifecycleEvent {
  return {
    status,
    at,
    source,
    reviewStatus,
    triageStatus,
    roadmapStatus,
  };
}

function hasSameLifecycleEventState(left: MyResponseLifecycleEvent, right: MyResponseLifecycleEvent) {
  return (
    left.status === right.status &&
    left.reviewStatus === right.reviewStatus &&
    left.triageStatus === right.triageStatus &&
    left.roadmapStatus === right.roadmapStatus
  );
}

function hasSameLifecycleEventIdentity(left: MyResponseLifecycleEvent, right: MyResponseLifecycleEvent) {
  return hasSameLifecycleEventState(left, right) && left.at === right.at && left.source === right.source;
}

function appendLifecycleEvent(
  events: MyResponseLifecycleEvent[] | undefined,
  event: MyResponseLifecycleEvent,
) {
  const safeEvents = (events ?? []).filter(isMyResponseLifecycleEvent);
  if (safeEvents.some((existingEvent) => hasSameLifecycleEventIdentity(existingEvent, event))) {
    return safeEvents;
  }
  const lastEvent = safeEvents[safeEvents.length - 1];
  if (lastEvent && hasSameLifecycleEventState(lastEvent, event)) {
    return safeEvents;
  }
  return [...safeEvents, event];
}

function mergeLifecycleEvents(
  existingEvents: MyResponseLifecycleEvent[] | undefined,
  incomingEvents: MyResponseLifecycleEvent[] | undefined,
) {
  return (incomingEvents ?? []).filter(isMyResponseLifecycleEvent).reduce(
    (events, event) => appendLifecycleEvent(events, event),
    (existingEvents ?? []).filter(isMyResponseLifecycleEvent),
  );
}

export function lifecycleStatusFromTriageStatus(
  triageStatus: SubmissionTriageStatus | undefined,
  storageStatus: MyResponseHistoryStatus = "submitted",
): MyResponseLifecycleStatus {
  return lifecycleStatusFromSubmissionState({
    triageStatus,
    storageStatus,
  });
}

export function lifecycleStatusFromSubmissionState({
  triageStatus,
  reviewStatus,
  storageStatus = "submitted",
}: {
  triageStatus?: SubmissionTriageStatus;
  reviewStatus?: MyResponseReviewStatus;
  storageStatus?: MyResponseHistoryStatus;
}): MyResponseLifecycleStatus {
  switch (triageStatus) {
    case "investigating":
      return "reviewing";
    case "planned":
      return "planned";
    case "in_progress":
      return "in_progress";
    case "fixed":
      return "completed";
    case "closed":
      return "closed";
    case "new":
      if (reviewStatus === "archived") {
        return "closed";
      }
      if (reviewStatus === "read") {
        return "reviewing";
      }
      return storageStatus === "submitted" ? "received" : "submitted";
    default:
      if (reviewStatus === "archived") {
        return "closed";
      }
      if (reviewStatus === "read") {
        return "reviewing";
      }
      return storageStatus === "submitted" ? "received" : "submitted";
  }
}

function normalizeMyResponseHistoryEntry(entry: MyResponseHistoryEntry): MyResponseHistoryEntry {
  const triageStatus = isSubmissionTriageStatus(entry.triageStatus) ? entry.triageStatus : undefined;
  const reviewStatus = isSubmissionReviewStatus(entry.reviewStatus) ? entry.reviewStatus : undefined;
  const lifecycleStatus = isMyResponseLifecycleStatus(entry.lifecycleStatus)
    ? entry.lifecycleStatus
    : lifecycleStatusFromSubmissionState({
        triageStatus,
        reviewStatus,
        storageStatus: entry.status,
      });
  const roadmapStatus = getRoadmapStatus(triageStatus);
  const lifecycleUpdatedAt = entry.lifecycleUpdatedAt ?? entry.submittedAt;
  const existingLifecycleEvents = (entry.lifecycleEvents ?? []).filter(isMyResponseLifecycleEvent);
  const lifecycleEvents =
    existingLifecycleEvents.length > 0
      ? existingLifecycleEvents
      : [
          buildLifecycleEvent({
            status: lifecycleStatus,
            at: lifecycleUpdatedAt,
            source: "sender",
            reviewStatus,
            triageStatus,
            roadmapStatus,
          }),
        ];
  return {
    ...entry,
    lifecycleStatus,
    reviewStatus,
    triageStatus,
    roadmapStatus,
    lifecycleUpdatedAt,
    lifecycleEvents,
  };
}

export function mergeMyResponseLifecycleFromSubmission(
  entry: MyResponseHistoryEntry,
  submission:
    | (Pick<Submission, "id" | "triageStatus" | "updatedAt"> & Partial<Pick<Submission, "status">>)
    | null
    | undefined,
): MyResponseHistoryEntry {
  if (!submission || submission.id !== entry.submissionId) {
    return normalizeMyResponseHistoryEntry(entry);
  }
  const normalized = normalizeMyResponseHistoryEntry(entry);
  const reviewStatus = isSubmissionReviewStatus(submission.status) ? submission.status : normalized.reviewStatus;
  const lifecycleStatus = lifecycleStatusFromSubmissionState({
    triageStatus: submission.triageStatus,
    reviewStatus,
    storageStatus: normalized.status,
  });
  const roadmapStatus = getRoadmapStatus(submission.triageStatus);
  const lifecycleUpdatedAt = submission.updatedAt;
  const lifecycleEvents = appendLifecycleEvent(
    normalized.lifecycleEvents,
    buildLifecycleEvent({
      status: lifecycleStatus,
      at: lifecycleUpdatedAt,
      source: "admin",
      reviewStatus,
      triageStatus: submission.triageStatus,
      roadmapStatus,
    }),
  );
  return {
    ...normalized,
    reviewStatus,
    triageStatus: submission.triageStatus,
    roadmapStatus,
    lifecycleStatus,
    lifecycleUpdatedAt,
    lifecycleEvents,
  };
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
  const lifecycleStatus = lifecycleStatusFromSubmissionState({
    triageStatus: submission.triageStatus,
    reviewStatus: submission.status,
    storageStatus: status,
  });
  const roadmapStatus = getRoadmapStatus(submission.triageStatus);
  const lifecycleUpdatedAt = submission.updatedAt ?? submission.respondentMeta?.submittedAt ?? submission.createdAt;
  return {
    submissionId: submission.id,
    formId: submission.formId,
    formTitle: form.title,
    projectId: submission.projectId ?? form.projectId,
    projectName: form.projectName,
    submittedAt: submission.respondentMeta?.submittedAt ?? submission.createdAt,
    status,
    storageMode,
    lifecycleStatus,
    reviewStatus: submission.status,
    triageStatus: submission.triageStatus,
    roadmapStatus,
    lifecycleUpdatedAt,
    lifecycleEvents: [
      buildLifecycleEvent({
        status: lifecycleStatus,
        at: lifecycleUpdatedAt,
        source: "sender",
        reviewStatus: submission.status,
        triageStatus: submission.triageStatus,
        roadmapStatus,
      }),
    ],
    formVersion: submission.formVersion ?? form.formVersion,
    schemaHash: submission.schemaHash ?? form.schemaHash,
    formBlobId: submission.formBlobId ?? form.blobId,
    manifestBlobId: submission.manifestBlobId ?? form.manifestBlobId,
    submissionBlobId: getSubmissionBlobId(submission),
    encrypted: Boolean(submission.isEncrypted),
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
    lifecycleStatus: lifecycleStatusFromTriageStatus(undefined, status),
    lifecycleUpdatedAt: submittedAt,
    lifecycleEvents: [
      buildLifecycleEvent({
        status: lifecycleStatusFromTriageStatus(undefined, status),
        at: submittedAt,
        source: "sender",
      }),
    ],
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
  const normalizedEntry = normalizeMyResponseHistoryEntry(entry);
  const normalizedExisting = existing ? normalizeMyResponseHistoryEntry(existing) : null;
  const nextEntry = existing
    ? {
        ...normalizedExisting,
        ...normalizedEntry,
        lifecycleEvents: mergeLifecycleEvents(normalizedExisting?.lifecycleEvents, normalizedEntry.lifecycleEvents),
        hiddenAt: existing.hiddenAt,
      }
    : normalizedEntry;
  const nextEntries = [
    nextEntry,
    ...entries.filter((item) => item.submissionId !== entry.submissionId),
  ].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  return safeWriteHistory(nextEntries);
}

export function updateMyResponseLifecycleFromSubmission(
  submission: Pick<Submission, "id" | "triageStatus" | "updatedAt"> & Partial<Pick<Submission, "status">>,
) {
  const entries = safeReadHistory();
  const existing = entries.find((entry) => entry.submissionId === submission.id);
  if (!existing) {
    return false;
  }
  return upsertMyResponseHistoryEntry(mergeMyResponseLifecycleFromSubmission(existing, submission));
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
