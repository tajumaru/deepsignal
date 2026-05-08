import { cryptoAdapter } from "../crypto/cryptoFactory";
import {
  getSubmissionCategoryFromPurpose,
  inferPriorityFromTemplateAnswers,
  normalizeFormPurpose,
} from "./formTemplates";
import { enrichSubmissionWithTriage } from "./signalTriage";
import { storage } from "../storage/storageFactory";
import type { FormField, FormSchema, FormSection, SealAdapter, StorageAdapter, Submission } from "../types";

export const storageAdapter: StorageAdapter = storage;
export const activeSealAdapter: SealAdapter = cryptoAdapter;

function stringifySensitiveValue(value: unknown) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function parseSensitiveValue(form: FormSchema, fieldId: string, value: string) {
  const field = form.fields.find((item) => item.id === fieldId);
  if (field?.type === "checkbox") {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (field?.type === "rating") {
    return value;
  }
  return value;
}

export async function encryptSensitiveAnswers(
  form: FormSchema,
  answers: Record<string, unknown>,
  seal: SealAdapter = activeSealAdapter,
) {
  const encryptedEntries = await Promise.all(
    Object.entries(answers).map(async ([fieldId, value]) => {
      const field = form.fields.find((item) => item.id === fieldId);
      if (!field?.sensitive || value === null || value === undefined || value === "") {
        return [fieldId, value] as const;
      }
      const encrypted = await seal.encrypt(stringifySensitiveValue(value));
      return [fieldId, { value: encrypted, encrypted: true }] as const;
    }),
  );

  return Object.fromEntries(encryptedEntries);
}

export async function decryptSensitiveAnswers(
  form: FormSchema,
  answers: Record<string, unknown>,
  seal: SealAdapter = activeSealAdapter,
) {
  const decryptedEntries = await Promise.all(
    Object.entries(answers).map(async ([fieldId, value]) => {
      const field = form.fields.find((item) => item.id === fieldId);
      if (!field?.sensitive || typeof value !== "object" || value === null) {
        return [fieldId, value] as const;
      }
      const encryptedValue = value as { encrypted?: boolean; value?: string };
      if (!encryptedValue.encrypted || !encryptedValue.value) {
        return [fieldId, value] as const;
      }
      const decrypted = await seal.decrypt(encryptedValue.value);
      return [fieldId, parseSensitiveValue(form, fieldId, decrypted)] as const;
    }),
  );
  return Object.fromEntries(decryptedEntries);
}

export function createEmptyAnswer(field: FormField) {
  if (field.type === "checkbox") {
    return [] as string[];
  }
  return "";
}

function coerceStatus(status: unknown): Submission["status"] {
  if (status === "read" || status === "archived" || status === "unread") {
    return status;
  }
  if (status === "reviewed") {
    return "read";
  }
  return "unread";
}

function coercePriority(priority: unknown): Submission["priority"] {
  if (priority === "low" || priority === "high" || priority === "medium") {
    return priority;
  }
  if (priority === "normal") {
    return "medium";
  }
  return "medium";
}

function coerceTriageStatus(triageStatus: unknown): Submission["triageStatus"] {
  if (
    triageStatus === "new" ||
    triageStatus === "investigating" ||
    triageStatus === "planned" ||
    triageStatus === "in_progress" ||
    triageStatus === "fixed" ||
    triageStatus === "closed"
  ) {
    return triageStatus;
  }
  return "new";
}

function coerceSignalValue(signalValue: unknown): Submission["signalValue"] {
  const value =
    typeof signalValue === "number"
      ? signalValue
      : typeof signalValue === "string"
        ? Number(signalValue)
        : undefined;
  if (!value || !Number.isFinite(value) || value < 1 || value > 5) {
    return undefined;
  }
  return Math.round(value);
}

function coerceSeverity(severity: unknown): Submission["severity"] {
  if (severity === "low" || severity === "medium" || severity === "high") {
    return severity;
  }
  return undefined;
}

export function normalizeSubmission(raw: Submission | (Record<string, unknown> & { id: string; formId: string; createdAt: string })) {
  const legacyNotes = Array.isArray(raw.notes)
    ? raw.notes
        .map((note) => {
          if (typeof note === "string") {
            return note;
          }
          if (note && typeof note === "object" && "body" in note) {
            return String(note.body ?? "");
          }
          return "";
        })
        .filter(Boolean)
        .join("\n\n")
    : typeof raw.notes === "string"
      ? raw.notes
      : "";

  return {
    id: raw.id,
    formId: raw.formId,
    answers: typeof raw.answers === "object" && raw.answers ? (raw.answers as Record<string, unknown>) : {},
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    metadata: typeof raw.metadata === "object" && raw.metadata ? (raw.metadata as Record<string, unknown>) : undefined,
    category:
      raw.category === "bug" || raw.category === "feature" || raw.category === "survey" || raw.category === "general"
        ? raw.category
        : "general",
    aiSummary: typeof raw.aiSummary === "string" ? raw.aiSummary : undefined,
    severity: coerceSeverity(raw.severity),
    emotion: typeof raw.emotion === "string" ? raw.emotion : undefined,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String).filter(Boolean) : undefined,
    embedding:
      Array.isArray(raw.embedding) && raw.embedding.every((value) => typeof value === "number")
        ? raw.embedding
        : undefined,
    clusterId: typeof raw.clusterId === "string" ? raw.clusterId : undefined,
    status: coerceStatus(raw.status),
    priority: coercePriority(raw.priority),
    triageStatus: coerceTriageStatus(raw.triageStatus),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    notes: legacyNotes,
    contributorId: typeof raw.contributorId === "string" ? raw.contributorId : undefined,
    responderSignature: typeof raw.responderSignature === "string" ? raw.responderSignature : undefined,
    responderSignedBytes: typeof raw.responderSignedBytes === "string" ? raw.responderSignedBytes : undefined,
    responderSignedAt: typeof raw.responderSignedAt === "string" ? raw.responderSignedAt : undefined,
    signalValue: coerceSignalValue(raw.signalValue),
    githubIssueUrl: typeof raw.githubIssueUrl === "string" ? raw.githubIssueUrl : undefined,
    githubPrUrl: typeof raw.githubPrUrl === "string" ? raw.githubPrUrl : undefined,
    isEncrypted: Boolean(raw.isEncrypted),
    encryptedBlobId: typeof raw.encryptedBlobId === "string" ? raw.encryptedBlobId : undefined,
    subjectPreview: typeof raw.subjectPreview === "string" ? raw.subjectPreview : undefined,
    ratingValue:
      typeof raw.ratingValue === "number"
        ? raw.ratingValue
        : typeof raw.ratingValue === "string"
          ? Number(raw.ratingValue)
          : undefined,
    createdAt: raw.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : raw.createdAt,
    blobId: typeof raw.blobId === "string" ? raw.blobId : undefined,
  } satisfies Submission;
}

export function normalizeForm(raw: FormSchema | (Record<string, unknown> & { id: string })) {
  return {
    ...raw,
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    fields: Array.isArray(raw.fields) ? (raw.fields as FormField[]) : [],
    sections: Array.isArray(raw.sections) ? (raw.sections as FormSection[]) : [],
    purpose: normalizeFormPurpose(raw.purpose),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
  } satisfies FormSchema;
}

function getSubjectPreview(form: FormSchema, answers: Record<string, unknown>) {
  const firstField = form.fields[0];
  if (!firstField) {
    return "Untitled signal";
  }
  const raw = answers[firstField.id];
  if (Array.isArray(raw)) {
    return raw.join(", ") || firstField.label;
  }
  return String(raw ?? "").trim() || firstField.label;
}

function getRatingValue(form: FormSchema, answers: Record<string, unknown>) {
  const ratingField = form.fields.find((field) => field.type === "rating");
  if (!ratingField) {
    return undefined;
  }
  const value = Number(answers[ratingField.id] ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

export async function resolveSubmissionAnswers(
  form: FormSchema,
  submission: Submission,
  seal: SealAdapter = activeSealAdapter,
) {
  if (submission.isEncrypted && submission.encryptedBlobId) {
    const payload = await storageAdapter.readEncryptedPayload(submission.encryptedBlobId);
    if (!payload) {
      return null;
    }
    const decrypted = await seal.decrypt(payload);
    const parsed = JSON.parse(decrypted) as {
      answers?: Record<string, unknown>;
      attachments?: Submission["attachments"];
    };
    return {
      answers: parsed.answers ?? {},
      attachments: parsed.attachments ?? submission.attachments,
    };
  }

  const decryptedAnswers = await decryptSensitiveAnswers(form, submission.answers, seal);
  return {
    answers: decryptedAnswers,
    attachments: submission.attachments,
  };
}

export async function saveSubmissionWithEncryption(
  form: FormSchema,
  submission: Submission,
  seal: SealAdapter = activeSealAdapter,
  targetStorage: StorageAdapter = storageAdapter,
) {
  const baseSubmission: Submission = {
    ...submission,
    category: submission.category ?? getSubmissionCategoryFromPurpose(normalizeFormPurpose(form.purpose)),
    status: coerceStatus(submission.status),
    priority:
      submission.priority === "low" || submission.priority === "medium" || submission.priority === "high"
        ? submission.priority
        : inferPriorityFromTemplateAnswers(normalizeFormPurpose(form.purpose), form.fields, submission.answers),
    triageStatus: coerceTriageStatus(submission.triageStatus),
    tags: submission.tags ?? [],
    notes: submission.notes ?? "",
    contributorId: submission.contributorId,
    responderSignature:
      typeof submission.responderSignature === "string"
        ? submission.responderSignature
        : undefined,
    responderSignedBytes:
      typeof submission.responderSignedBytes === "string"
        ? submission.responderSignedBytes
        : undefined,
    responderSignedAt:
      typeof submission.responderSignedAt === "string"
        ? submission.responderSignedAt
        : undefined,
    signalValue: coerceSignalValue(submission.signalValue),
    githubIssueUrl: typeof submission.githubIssueUrl === "string" ? submission.githubIssueUrl.trim() || undefined : undefined,
    githubPrUrl: typeof submission.githubPrUrl === "string" ? submission.githubPrUrl.trim() || undefined : undefined,
    subjectPreview: getSubjectPreview(form, submission.answers),
    ratingValue: getRatingValue(form, submission.answers),
    updatedAt: submission.updatedAt ?? submission.createdAt,
  };
  const triagedSubmission = enrichSubmissionWithTriage(form, baseSubmission);

  if (form.encryptSubmissions) {
    const payload = JSON.stringify({
      answers: submission.answers,
      attachments: submission.attachments,
    });
    const encryptedPayload = await seal.encrypt(payload);
    const { blobId: encryptedBlobId } = await targetStorage.saveEncryptedPayload(encryptedPayload);
    const metadataSubmission: Submission = {
      ...triagedSubmission,
      answers: {},
      isEncrypted: true,
      encryptedBlobId,
    };
    const saved = await targetStorage.saveSubmission(metadataSubmission);
    return { ...saved, encryptedBlobId };
  }

  const answers = await encryptSensitiveAnswers(form, submission.answers, seal);
  const standardSubmission: Submission = {
    ...triagedSubmission,
    answers,
    isEncrypted: false,
    encryptedBlobId: undefined,
  };
  return targetStorage.saveSubmission(standardSubmission);
}
