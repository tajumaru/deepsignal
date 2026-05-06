import { cryptoAdapter } from "../crypto/cryptoFactory";
import { storage } from "../storage/storageFactory";
import type { FormField, FormSchema, SealAdapter, StorageAdapter, Submission } from "../types";

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
    status: coerceStatus(raw.status),
    priority: coercePriority(raw.priority),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    notes: legacyNotes,
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
    blobId: typeof raw.blobId === "string" ? raw.blobId : undefined,
  } satisfies Submission;
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
) {
  const baseSubmission: Submission = {
    ...submission,
    status: coerceStatus(submission.status),
    priority: coercePriority(submission.priority),
    tags: submission.tags ?? [],
    notes: submission.notes ?? "",
    subjectPreview: getSubjectPreview(form, submission.answers),
    ratingValue: getRatingValue(form, submission.answers),
  };

  if (form.encryptSubmissions) {
    const payload = JSON.stringify({
      answers: submission.answers,
      attachments: submission.attachments,
    });
    const encryptedPayload = await seal.encrypt(payload);
    const { blobId: encryptedBlobId } = await storageAdapter.saveEncryptedPayload(encryptedPayload);
    const metadataSubmission: Submission = {
      ...baseSubmission,
      answers: {},
      isEncrypted: true,
      encryptedBlobId,
    };
    const saved = await storageAdapter.saveSubmission(metadataSubmission);
    return { ...saved, encryptedBlobId };
  }

  const answers = await encryptSensitiveAnswers(form, submission.answers, seal);
  const standardSubmission: Submission = {
    ...baseSubmission,
    answers,
    isEncrypted: false,
    encryptedBlobId: undefined,
  };
  return storageAdapter.saveSubmission(standardSubmission);
}
