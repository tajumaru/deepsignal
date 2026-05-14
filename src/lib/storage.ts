import {
  decryptSensitiveResponse,
  encryptSensitiveResponse,
  sealServiceAdapter,
} from "../crypto/sealService";
import {
  DecryptDiagnosticError,
  buildDecryptDiagnosticContext,
  classifyDecryptError,
  describeEncryptedPayloadShape,
  logDecryptDiagnostic,
  validateEncryptedPayloadOrThrow,
} from "../crypto/decryptDiagnostics";
import { fromBase64, parseRealSealEnvelope, toBase64 } from "../crypto/sealPayload";
import { hasChoiceOptions, isAttachmentFieldType, isConfirmationCheckboxField, normalizeFieldType } from "./fieldTypes";
import { normalizeLogicGroup, sanitizeConditionalLogicFields } from "../utils/formLogic";
import {
  getSubmissionCategoryFromPurpose,
  inferPriorityFromTemplateAnswers,
  normalizeFormPurpose,
} from "./formTemplates";
import { formatAnswerText } from "./answerFormatting";
import { normalizeFormVisibility } from "./explore";
import { isResponseDeadlinePassed } from "./responseDeadline";
import { enrichSubmissionWithTriage } from "./signalTriage";
import { storage } from "../storage/storageFactory";
import type {
  FormField,
  FormIdentityPolicy,
  FormSchema,
  FormSection,
  SealAdapter,
  SealDecryptContext,
  SealEncryptContext,
  StorageAdapter,
  Submission,
  SubmissionAttachment,
} from "../types";

export const storageAdapter: StorageAdapter = storage;
export const activeSealAdapter: SealAdapter = sealServiceAdapter;

export interface SaveSubmissionWithEncryptionResult {
  id: string;
  blobId?: string;
  encryptedBlobId?: string;
  encryptedPayload?: string;
  sealIdentity?: string;
}

const REAL_SEAL_PROJECT_REQUIRED_MESSAGE =
  "Real Seal encrypted submissions require a selected project. Choose a project or turn off Encrypt submissions.";

function inferAttachmentType(mimeType: string | undefined) {
  if (mimeType?.startsWith("video/")) {
    return "video" as const;
  }
  if (mimeType?.startsWith("image/")) {
    return "image" as const;
  }
  return "document" as const;
}

function stringifySensitiveValue(value: unknown) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function parseSensitiveValue(form: FormSchema, fieldId: string, value: string) {
  const field = form.fields.find((item) => item.id === fieldId);
  const fieldType = field ? normalizeFieldType(field.type) : undefined;
  if (fieldType === "checkbox") {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (fieldType && isConfirmationCheckboxField(fieldType)) {
    return value === "true";
  }
  if (fieldType === "rating") {
    return value;
  }
  return value;
}

function normalizeSubmissionAttachment(raw: unknown): SubmissionAttachment | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const attachment = raw as Partial<SubmissionAttachment> & Record<string, unknown>;
  if (typeof attachment.fieldId !== "string" || typeof attachment.blobId !== "string") {
    return null;
  }
  return {
    fieldId: attachment.fieldId,
    type:
      attachment.type === "video"
        ? "video"
        : attachment.type === "document"
          ? "document"
          : "image",
    blobId: attachment.blobId,
    name: typeof attachment.name === "string" ? attachment.name : attachment.originalName ?? "attachment",
    size: typeof attachment.size === "number" ? attachment.size : 0,
    storage: attachment.storage === "inline" ? "inline" : attachment.storage === "blob" ? "blob" : undefined,
    encrypted: attachment.encrypted === true ? true : undefined,
    originalName: typeof attachment.originalName === "string" ? attachment.originalName : undefined,
    originalType: typeof attachment.originalType === "string" ? attachment.originalType : undefined,
    encoding: attachment.encoding === "seal-base64-v1" ? "seal-base64-v1" : undefined,
    inlineData: typeof attachment.inlineData === "string" ? attachment.inlineData : undefined,
  };
}

function normalizeSubmissionAttachments(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [] as SubmissionAttachment[];
  }
  return raw
    .map((attachment) => normalizeSubmissionAttachment(attachment))
    .filter((attachment): attachment is SubmissionAttachment => Boolean(attachment));
}

export async function createEncryptedAttachmentUpload(
  file: File,
  seal: SealAdapter = activeSealAdapter,
  context: SealEncryptContext = {},
) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encryptedPayload = await encryptSensitiveResponse(toBase64(bytes), context, seal);
  const encryptedFile = new File([encryptedPayload], `${file.name}.seal`, {
    type: "text/plain",
    lastModified: file.lastModified,
  });
  return {
    file: encryptedFile,
    attachment: {
      encrypted: true as const,
      originalName: file.name,
      originalType: file.type || "application/octet-stream",
      encoding: "seal-base64-v1" as const,
    },
  };
}

// This does not Seal-encrypt the file by itself. The attachment bytes are embedded
// into the private submission payload, and the full payload is Seal-encrypted in
// saveSubmissionWithEncryption().
export async function createInlinePrivateAttachment(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    fieldId: "",
    type: inferAttachmentType(file.type),
    blobId: `inline:${crypto.randomUUID()}`,
    name: file.name,
    size: file.size,
    storage: "inline" as const,
    encrypted: true as const,
    originalName: file.name,
    originalType: file.type || "application/octet-stream",
    encoding: "seal-base64-v1" as const,
    inlineData: toBase64(bytes),
  } satisfies SubmissionAttachment;
}

function stripInlineAttachmentData(attachments: SubmissionAttachment[]) {
  return attachments.map((attachment) => {
    if (attachment.storage !== "inline") {
      return attachment;
    }
    return {
      ...attachment,
      inlineData: undefined,
    } satisfies SubmissionAttachment;
  });
}

export async function decryptAttachmentBlob(
  attachment: SubmissionAttachment,
  seal: SealAdapter = activeSealAdapter,
  context: SealDecryptContext = {},
  targetStorage: StorageAdapter = storageAdapter,
) {
  if (attachment.storage === "inline" && attachment.inlineData) {
    const blob = new Blob([fromBase64(attachment.inlineData)], {
      type: attachment.originalType || "application/octet-stream",
    });
    return {
      blob,
      name: attachment.originalName ?? attachment.name,
      mimeType: attachment.originalType || "application/octet-stream",
    };
  }
  if (!attachment.encrypted) {
    const blob = await targetStorage.readFileBlob(attachment.blobId);
    if (!blob) {
      return null;
    }
    return {
      blob,
      name: attachment.originalName ?? attachment.name,
      mimeType: attachment.originalType || blob.type || "application/octet-stream",
    };
  }
  const encryptedPayload = await targetStorage.readFileText(attachment.blobId);
  if (!encryptedPayload) {
    return null;
  }
  const { plaintext: decrypted } = await decryptSensitiveResponse(encryptedPayload, context, seal);
  const blob = new Blob([fromBase64(decrypted)], {
    type: attachment.originalType || "application/octet-stream",
  });
  return {
    blob,
    name: attachment.originalName ?? attachment.name,
    mimeType: attachment.originalType || "application/octet-stream",
  };
}

export async function encryptSensitiveAnswers(
  form: FormSchema,
  answers: Record<string, unknown>,
  seal: SealAdapter = activeSealAdapter,
  context: SealEncryptContext = {},
) {
  const encryptedEntries = await Promise.all(
    Object.entries(answers).map(async ([fieldId, value]) => {
      const field = form.fields.find((item) => item.id === fieldId);
      if (!field?.sensitive || value === null || value === undefined || value === "") {
        return [fieldId, value] as const;
      }
      const encrypted = await encryptSensitiveResponse(stringifySensitiveValue(value), context, seal);
      return [fieldId, { value: encrypted, encrypted: true }] as const;
    }),
  );

  return Object.fromEntries(encryptedEntries);
}

export async function decryptSensitiveAnswers(
  form: FormSchema,
  answers: Record<string, unknown>,
  seal: SealAdapter = activeSealAdapter,
  context: SealDecryptContext = {},
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
      const { plaintext } = await decryptSensitiveResponse(encryptedValue.value, context, seal);
      const decrypted = plaintext;
      return [fieldId, parseSensitiveValue(form, fieldId, decrypted)] as const;
    }),
  );
  return Object.fromEntries(decryptedEntries);
}

export function createEmptyAnswer(field: FormField) {
  const fieldType = normalizeFieldType(field.type);
  if (fieldType === "checkbox" || isAttachmentFieldType(fieldType)) {
    return [] as string[];
  }
  if (isConfirmationCheckboxField(fieldType)) {
    return false;
  }
  return "";
}

export { getStorageRuntimeStatus } from "../storage/storageFactory";

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

function normalizeFormIdentityPolicy(identityPolicy: unknown): FormIdentityPolicy {
  return identityPolicy === "wallet_required" ? "wallet_required" : "anonymous_allowed";
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
  const publicPayload =
    raw.publicPayload && typeof raw.publicPayload === "object"
      ? (raw.publicPayload as NonNullable<Submission["publicPayload"]>)
      : null;

  return {
    id: raw.id,
    formId: raw.formId,
    answers: typeof raw.answers === "object" && raw.answers ? (raw.answers as Record<string, unknown>) : {},
    attachments: normalizeSubmissionAttachments(raw.attachments),
    publicPayload: publicPayload
      ? {
          ...publicPayload,
          attachments: normalizeSubmissionAttachments(publicPayload.attachments),
        }
      : undefined,
    respondentMeta:
      raw.respondentMeta && typeof raw.respondentMeta === "object"
        ? (raw.respondentMeta as Submission["respondentMeta"])
        : undefined,
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
    encryptedPayload: typeof raw.encryptedPayload === "string" ? raw.encryptedPayload : undefined,
    receiptBlobId: typeof raw.receiptBlobId === "string" ? raw.receiptBlobId : undefined,
    sealIdentity: typeof raw.sealIdentity === "string" ? raw.sealIdentity : undefined,
    onchainSignalId:
      typeof raw.onchainSignalId === "number"
        ? raw.onchainSignalId
        : typeof raw.onchainSignalId === "string"
          ? Number(raw.onchainSignalId)
          : undefined,
    signalReceiptMetadataDigest:
      typeof raw.signalReceiptMetadataDigest === "string" ? raw.signalReceiptMetadataDigest : undefined,
    onchainStatus:
      raw.onchainStatus === "new" || raw.onchainStatus === "triaged" || raw.onchainStatus === "archived"
        ? raw.onchainStatus
        : undefined,
    pendingOnchainRegistration: Boolean(raw.pendingOnchainRegistration),
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
  const rawFields = Array.isArray(raw.fields) ? (raw.fields as FormField[]) : [];
  return {
    ...raw,
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    fields: sanitizeConditionalLogicFields(
      rawFields.map((field) => {
        const fieldType = normalizeFieldType(field.type);
        return {
          ...field,
          type: fieldType,
          options: hasChoiceOptions(fieldType)
            ? Array.isArray(field.options)
              ? field.options.map((option) => String(option))
              : []
            : undefined,
          visibilityRules: normalizeLogicGroup(field.visibilityRules),
          requiredRules: normalizeLogicGroup(field.requiredRules),
        };
      }),
    ),
    sections: Array.isArray(raw.sections) ? (raw.sections as FormSection[]) : [],
    purpose: normalizeFormPurpose(raw.purpose),
    visibility: normalizeFormVisibility(raw.visibility, raw.publicExplore),
    identityPolicy: normalizeFormIdentityPolicy(raw.identityPolicy),
    publicExplore: raw.publicExplore === true || normalizeFormVisibility(raw.visibility, raw.publicExplore) === "public",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
    projectName: typeof raw.projectName === "string" ? raw.projectName : undefined,
    responseDeadline:
      typeof raw.responseDeadline === "number"
        ? raw.responseDeadline
        : typeof raw.responseDeadline === "string"
          ? Number(raw.responseDeadline)
          : null,
    responseDeadlineMode:
      raw.responseDeadlineMode === "relative"
        ? "relative"
        : raw.responseDeadlineMode === "custom"
          ? "custom"
          : "none",
    onchainFormId:
      typeof raw.onchainFormId === "number"
        ? raw.onchainFormId
        : typeof raw.onchainFormId === "string"
          ? Number(raw.onchainFormId)
          : undefined,
    formMetadataDigest: typeof raw.formMetadataDigest === "string" ? raw.formMetadataDigest : undefined,
    registrationMode: raw.registrationMode === "sui" ? "sui" : "walrus",
  } satisfies FormSchema;
}

function getSubjectPreview(form: FormSchema, answers: Record<string, unknown>) {
  const firstField = form.fields[0];
  if (!firstField) {
    return "Untitled signal";
  }
  const preview = formatAnswerText(firstField, answers[firstField.id], "en").trim();
  return preview || firstField.label;
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
  context: SealDecryptContext = {},
) {
  if (submission.isEncrypted && (submission.encryptedPayload || submission.encryptedBlobId)) {
    try {
      const baseDiagnostics = buildDecryptDiagnosticContext(form, submission, context);
      logDecryptDiagnostic("start", baseDiagnostics);
      const payload =
        submission.encryptedPayload ??
        (submission.encryptedBlobId
          ? await storageAdapter.readEncryptedPayload(submission.encryptedBlobId)
          : null);
      if (!payload) {
        throw new DecryptDiagnosticError(
          submission.encryptedBlobId ? "WALRUS_BLOB_FETCH_FAILED" : "MANIFEST_NOT_FOUND",
          submission.encryptedBlobId
            ? "Encrypted payload blob could not be fetched."
            : "Encrypted payload manifest reference is missing.",
          baseDiagnostics,
        );
      }
      const envelope = validateEncryptedPayloadOrThrow(payload, baseDiagnostics);
      const diagnostics = {
        ...baseDiagnostics,
        packageId: envelope.packageId,
        policyId: envelope.approvalPolicy,
        accessObjectId: envelope.objectId,
        approvalPolicy: envelope.approvalPolicy,
        encryptedPayloadShape: describeEncryptedPayloadShape(payload),
        ciphertextSize: envelope.encryptedObject.length,
      };
      logDecryptDiagnostic("payload_validated", diagnostics);
      const decryptedResult = await decryptSensitiveResponse(payload, context, seal);
      const decrypted = decryptedResult.plaintext;
      let parsed: {
        answers?: Record<string, unknown>;
        attachments?: Submission["attachments"];
      };
      try {
        parsed = JSON.parse(decrypted) as {
          answers?: Record<string, unknown>;
          attachments?: Submission["attachments"];
        };
      } catch (error) {
        throw new DecryptDiagnosticError(
          "INVALID_ENCRYPTED_PAYLOAD",
          error instanceof Error
            ? `Failed to parse decrypted submission payload: ${error.message}`
            : "Failed to parse decrypted submission payload.",
          diagnostics,
          error,
        );
      }
      logDecryptDiagnostic("success", diagnostics);
      return {
        answers: parsed.answers ?? {},
        attachments:
          parsed.attachments === undefined
            ? submission.attachments
            : normalizeSubmissionAttachments(parsed.attachments),
        legacyUnencrypted: decryptedResult.legacyUnencrypted,
      };
    } catch (error) {
      const reasonCode = classifyDecryptError(error);
      const diagnostics =
        error instanceof DecryptDiagnosticError
          ? error.diagnostics
          : buildDecryptDiagnosticContext(form, submission, context);
      logDecryptDiagnostic("failure", diagnostics, error);
      if (error instanceof DecryptDiagnosticError) {
        throw error;
      }
      throw new DecryptDiagnosticError(
        reasonCode,
        `Decrypt failed: ${reasonCode}`,
        diagnostics,
        error,
      );
    }
  }

  const decryptedAnswers = await decryptSensitiveAnswers(form, submission.answers, seal, context);
  return {
    answers: decryptedAnswers,
    attachments: submission.attachments,
    legacyUnencrypted: false,
  };
}

export async function saveSubmissionWithEncryption(
  form: FormSchema,
  submission: Submission,
  seal: SealAdapter = activeSealAdapter,
  targetStorage: StorageAdapter = storageAdapter,
  messages?: {
    responseDeadlinePassed?: string;
  },
): Promise<SaveSubmissionWithEncryptionResult> {
  if (isResponseDeadlinePassed(form.responseDeadline)) {
    throw new Error(messages?.responseDeadlinePassed ?? "This form is no longer accepting responses.");
  }

  const isFullyEncrypted = form.encryptSubmissions === true;
  const subjectPreview = isFullyEncrypted ? "Private signal" : getSubjectPreview(form, submission.answers);
  const ratingValue = isFullyEncrypted ? undefined : getRatingValue(form, submission.answers);
  const priority =
    submission.priority === "low" || submission.priority === "medium" || submission.priority === "high"
      ? submission.priority
      : isFullyEncrypted
        ? "medium"
        : inferPriorityFromTemplateAnswers(normalizeFormPurpose(form.purpose), form.fields, submission.answers);
  const baseSubmission: Submission = {
    ...submission,
    category: submission.category ?? getSubmissionCategoryFromPurpose(normalizeFormPurpose(form.purpose)),
    status: coerceStatus(submission.status),
    priority,
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
    subjectPreview,
    ratingValue,
    updatedAt: submission.updatedAt ?? submission.createdAt,
  };
  const triageInput = isFullyEncrypted
    ? {
        ...baseSubmission,
        answers: {},
      }
    : baseSubmission;
  const triagedSubmission = enrichSubmissionWithTriage(form, triageInput);

  if (form.encryptSubmissions) {
    if (!form.projectId?.trim()) {
      throw new Error(REAL_SEAL_PROJECT_REQUIRED_MESSAGE);
    }

    const encryptedBlobId = submission.encryptedBlobId;
    let encryptedPayload = submission.encryptedPayload;
    if (!encryptedPayload) {
      const payload = JSON.stringify({
        answers: submission.answers,
        attachments: submission.attachments,
      });
      encryptedPayload = await encryptSensitiveResponse(payload, { projectId: form.projectId }, seal);
    }
    const parsedEnvelope = parseRealSealEnvelope(encryptedPayload);
    const sealIdentity = parsedEnvelope
      ? `seal:${parsedEnvelope.packageId}:${parsedEnvelope.objectId}`
      : submission.sealIdentity;
    const metadataSubmission: Submission = {
      ...triagedSubmission,
      attachments: stripInlineAttachmentData(submission.attachments),
      answers: {},
      isEncrypted: true,
      encryptedBlobId,
      encryptedPayload,
      sealIdentity,
    };
    const saved = await targetStorage.saveSubmission(metadataSubmission);
    return {
      ...saved,
      encryptedBlobId,
      encryptedPayload,
      sealIdentity,
    };
  }

  const answers = await encryptSensitiveAnswers(form, submission.answers, seal, {
    projectId: form.projectId,
  });
  const standardSubmission: Submission = {
    ...triagedSubmission,
    answers,
    isEncrypted: false,
    encryptedBlobId: undefined,
    encryptedPayload: undefined,
    sealIdentity: undefined,
  };
  return targetStorage.saveSubmission(standardSubmission);
}
