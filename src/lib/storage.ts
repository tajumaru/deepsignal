import {
  createEncryptionGuardError,
  decryptSensitiveResponse,
  ENCRYPTION_FAILED_CODE,
  ENCRYPTION_FAILED_MESSAGE,
  ENCRYPTION_REQUIRED_CODE,
  encryptSensitiveResponse,
  sealServiceAdapter,
} from "../crypto/sealService";
import {
  DecryptDiagnosticError,
  buildDecryptDiagnosticContext,
  buildSealDecryptPolicySnapshot,
  buildSealEncryptPolicySnapshotFromEnvelope,
  classifyDecryptError,
  compareSealPolicySnapshots,
  describeEncryptedPayloadShape,
  logDecryptDiagnostic,
  normalizeStoredSealPolicySnapshot,
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
import { normalizeActivityEvent } from "./activityLog";
import { LEGACY_SCHEMA_HASH, computeSchemaHash, resolveFormVersion } from "./formVersioning";
import { isResponseDeadlinePassed } from "./responseDeadline";
import { enrichSubmissionWithTriage } from "./signalTriage";
import { SUI_NETWORK } from "./sui";
import { getWalrusNetwork } from "./walrusProof";
import { storage } from "../storage/storageFactory";
import { getStorageRuntimeStatus } from "../storage/storageFactory";
import { DEFAULT_ATTACHMENT_MAX_BYTES, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES } from "./attachmentLimits";
import {
  assertEncryptedSubmissionAttachments,
  sanitizeSubmissionForStorage,
} from "../storage/submissionSanitizer";
import type {
  AnalysisProfileId,
  AnalysisSignalType,
  AnalystType,
  AnalysisType,
  FormField,
  FormIdentityPolicy,
  FormLocationRequirement,
  FormSchema,
  FormSection,
  SealAdapter,
  SealDecryptContext,
  SealEncryptContext,
  StorageAdapter,
  Submission,
  SubmissionAttachment,
  SubmissionLocation,
  TatumStorageRecord,
  WalrusBlobProof,
} from "../types";

export const storageAdapter: StorageAdapter = storage;
export const activeSealAdapter: SealAdapter = sealServiceAdapter;
export const ENCRYPTION_REQUIRED_MESSAGE =
  "Protected submissions require encrypted Walrus storage in production. Response was not submitted.";
export { DEFAULT_ATTACHMENT_MAX_BYTES, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES };

export interface SaveSubmissionWithEncryptionResult {
  id: string;
  formVersion?: number;
  formBlobId?: string;
  schemaHash?: string;
  manifestBlobId?: string;
  blobId?: string;
  answerBlobId?: string;
  encryptedBlobId?: string;
  encryptedPayload?: string;
  sealIdentity?: string;
  remoteIndexBlobId?: string;
  remoteIndexTarget?: string;
  remoteIndexUpdated?: boolean;
  remoteIndexReadBack?: boolean;
  ownerReadable?: boolean;
  remoteSyncStatus?: "remote_synced" | "sync_pending" | "local_only";
  walrusProof?: WalrusBlobProof;
  encryptedWalrusProof?: WalrusBlobProof;
}

export interface ResolvedSubmissionAnswers {
  answers: Record<string, unknown>;
  attachments: SubmissionAttachment[];
  location?: SubmissionLocation;
  metadata?: Submission["metadata"];
  legacyUnencrypted: boolean;
}

const REAL_SEAL_PROJECT_REQUIRED_MESSAGE =
  "Real Seal encrypted submissions require a project or form owner wallet. Connect the creator wallet or turn off Encrypt submissions.";

function inferAttachmentType(mimeType: string | undefined) {
  if (mimeType?.startsWith("audio/")) {
    return "audio" as const;
  }
  if (mimeType?.startsWith("video/")) {
    return "video" as const;
  }
  if (mimeType?.startsWith("image/")) {
    return "image" as const;
  }
  return "document" as const;
}

function stringifySensitiveValue(value: unknown) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value);
  }
  return String(value);
}

function parseSensitiveValue(form: FormSchema, fieldId: string, value: string) {
  const field = form.fields.find((item) => item.id === fieldId);
  const fieldType = field ? normalizeFieldType(field.type) : undefined;
  if (fieldType === "checkbox" || fieldType === "matrix") {
    try {
      return JSON.parse(value);
    } catch {
      return fieldType === "matrix" ? {} : [];
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
        : attachment.type === "audio"
          ? "audio"
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
    walrusProof: normalizeWalrusProof(attachment.walrusProof, attachment.blobId),
    tatumStorage: normalizeTatumStorageRecord(attachment.tatumStorage, attachment.blobId),
  };
}

function normalizeWalrusProof(raw: unknown, fallbackBlobId?: string): WalrusBlobProof | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const proof = raw as Partial<WalrusBlobProof> & Record<string, unknown>;
  const blobId = typeof proof.blobId === "string" ? proof.blobId : fallbackBlobId;
  if (!blobId) {
    return undefined;
  }
  const size = typeof proof.size === "number" && Number.isFinite(proof.size) ? proof.size : undefined;
  const epoch = typeof proof.epoch === "number" && Number.isFinite(proof.epoch) ? proof.epoch : undefined;
  return {
    blobId,
    objectId: typeof proof.objectId === "string" ? proof.objectId : undefined,
    size,
    epoch,
    network: getWalrusNetwork(typeof proof.network === "string" ? proof.network : SUI_NETWORK),
  };
}

function normalizeTatumStorageRecord(raw: unknown, fallbackBlobId?: string): TatumStorageRecord | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Partial<TatumStorageRecord> & Record<string, unknown>;
  const jobId = typeof record.jobId === "string" ? record.jobId : undefined;
  const blobId = typeof record.blobId === "string" ? record.blobId : fallbackBlobId;
  const fileId = typeof record.fileId === "string" ? record.fileId : undefined;
  const status = typeof record.status === "string" ? record.status : undefined;
  const downloadUrl = typeof record.downloadUrl === "string" ? record.downloadUrl : undefined;
  if (!jobId && !blobId && !fileId && !status && !downloadUrl) {
    return undefined;
  }
  return {
    jobId,
    blobId,
    fileId,
    status,
    downloadUrl,
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
export async function createInlinePrivateAttachment(
  file: File,
  maxSizeBytes: number = ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES,
) {
  if (file.size > maxSizeBytes) {
    const maxSizeMb = Math.round(maxSizeBytes / (1024 * 1024));
    throw new Error(`Encrypted attachments are limited to ${maxSizeMb}MB. Please choose a smaller file.`);
  }
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
  const { plaintext: decrypted } = await decryptSensitiveResponse(encryptedPayload, context, seal, {
    encryptedMarker: true,
    diagnostics: {
      encryptedBlobId: attachment.blobId,
      source: "storage.readFileText",
    },
  });
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
      if (!encryptedValue.encrypted) {
        return [fieldId, value] as const;
      }
      const encryptedPayload = typeof encryptedValue.value === "string" ? encryptedValue.value : "";
      const { plaintext } = await decryptSensitiveResponse(encryptedPayload, context, seal, {
        encryptedMarker: true,
        diagnostics: {
          formId: form.id,
          source: "submission.answers.encryptedField",
        },
      });
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
  if (fieldType === "voice") {
    return null;
  }
  if (fieldType === "matrix") {
    return {} as Record<string, string>;
  }
  if (isConfirmationCheckboxField(fieldType)) {
    return false;
  }
  return "";
}

export { getStorageRuntimeStatus } from "../storage/storageFactory";

function isProductionProtectedStorageUnavailable(targetStorage: StorageAdapter) {
  if (!import.meta.env.PROD || targetStorage !== storageAdapter) {
    return false;
  }
  return getStorageRuntimeStatus().mode !== "walrus";
}

function createMissingEncryptedPayloadError(message: string, diagnostics: ReturnType<typeof buildDecryptDiagnosticContext>) {
  return new DecryptDiagnosticError(
    "ENCRYPTED_PAYLOAD_MISSING",
    message,
    diagnostics,
  );
}

function assertEnvelopePolicyMatchesForm(
  form: FormSchema,
  envelope: ReturnType<typeof validateEncryptedPayloadOrThrow>,
  diagnostics: ReturnType<typeof buildDecryptDiagnosticContext>,
) {
  const formProjectId = form.projectId?.trim().toLowerCase();
  const formOwnerAddress = form.ownerAddress?.trim()?.toLowerCase();
  const envelopeProjectId = envelope.projectId?.trim().toLowerCase();
  const envelopeOwnerAddress = envelope.ownerAddress?.trim()?.toLowerCase();

  if (envelope.network !== SUI_NETWORK) {
    throw new DecryptDiagnosticError(
      "POLICY_MISMATCH",
      "Encryption policy mismatch.",
      diagnostics,
    );
  }

  if (formProjectId && envelopeProjectId && formProjectId !== envelopeProjectId) {
    throw new DecryptDiagnosticError(
      "POLICY_MISMATCH",
      "Encryption policy mismatch.",
      diagnostics,
    );
  }

  if (formOwnerAddress && envelopeOwnerAddress && formOwnerAddress !== envelopeOwnerAddress) {
    throw new DecryptDiagnosticError(
      "POLICY_MISMATCH",
      "Encryption policy mismatch.",
      diagnostics,
    );
  }

  if (!envelope.policyId || !envelope.policyObjectId) {
    throw new DecryptDiagnosticError(
      "POLICY_MISMATCH",
      "Encryption policy mismatch.",
      diagnostics,
    );
  }
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

function normalizeFormIdentityPolicy(identityPolicy: unknown): FormIdentityPolicy {
  return identityPolicy === "wallet_required" ? "wallet_required" : "anonymous_allowed";
}

function normalizeFormLocationRequirement(locationRequirement: unknown): FormLocationRequirement | undefined {
  return locationRequirement === "required" || locationRequirement === "optional" ? locationRequirement : undefined;
}

function normalizeAnalysisProfileId(analysisProfileId: unknown): AnalysisProfileId | undefined {
  return analysisProfileId === "customer_feedback" ||
    analysisProfileId === "ai_agent_log" ||
    analysisProfileId === "incident_report" ||
    analysisProfileId === "governance_signal" ||
    analysisProfileId === "general_signal"
    ? analysisProfileId
    : undefined;
}

function normalizeSignalType(signalType: unknown): AnalysisSignalType | undefined {
  return signalType === "feedback" ||
    signalType === "product_voice" ||
    signalType === "agent_log" ||
    signalType === "operation" ||
    signalType === "incident" ||
    signalType === "internal_report" ||
    signalType === "disaster" ||
    signalType === "safety" ||
    signalType === "governance" ||
    signalType === "community" ||
    signalType === "generic"
    ? signalType
    : undefined;
}

function normalizeAnalystType(analystType: unknown): AnalystType | undefined {
  return analystType === "risk" ||
    analystType === "operations" ||
    analystType === "product" ||
    analystType === "community" ||
    analystType === "executive"
    ? analystType
    : undefined;
}

function normalizeAnalysisType(analysisType: unknown): AnalysisType | undefined {
  return analysisType === "summary" ||
    analysisType === "risk" ||
    analysisType === "trend" ||
    analysisType === "action" ||
    analysisType === "sentiment" ||
    analysisType === "urgency" ||
    analysisType === "anomaly" ||
    analysisType === "silence" ||
    analysisType === "velocity"
    ? analysisType
    : undefined;
}

function normalizeSubmissionLocation(raw: unknown): SubmissionLocation | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const location = raw as Partial<SubmissionLocation>;
  if (
    typeof location.latitude !== "number" ||
    !Number.isFinite(location.latitude) ||
    typeof location.longitude !== "number" ||
    !Number.isFinite(location.longitude) ||
    typeof location.accuracy !== "number" ||
    !Number.isFinite(location.accuracy) ||
    typeof location.capturedAt !== "string" ||
    location.source !== "browser_geolocation"
  ) {
    return undefined;
  }
  return location as SubmissionLocation;
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
    formVersion: resolveFormVersion(raw),
    formBlobId: typeof raw.formBlobId === "string" ? raw.formBlobId : undefined,
    schemaHash: typeof raw.schemaHash === "string" && raw.schemaHash.trim() ? raw.schemaHash : LEGACY_SCHEMA_HASH,
    manifestBlobId: typeof raw.manifestBlobId === "string" ? raw.manifestBlobId : undefined,
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
    answers: typeof raw.answers === "object" && raw.answers ? (raw.answers as Record<string, unknown>) : {},
    attachments: normalizeSubmissionAttachments(raw.attachments),
    location: normalizeSubmissionLocation(raw.location),
    publicPayload: publicPayload
      ? {
          ...publicPayload,
          attachments: normalizeSubmissionAttachments(publicPayload.attachments),
          location: normalizeSubmissionLocation(publicPayload.location),
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
    encryptedWalrusProof: normalizeWalrusProof(
      raw.encryptedWalrusProof,
      typeof raw.encryptedBlobId === "string" ? raw.encryptedBlobId : undefined,
    ),
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
    answerBlobId: typeof raw.answerBlobId === "string" ? raw.answerBlobId : undefined,
    remoteIndexBlobId: typeof raw.remoteIndexBlobId === "string" ? raw.remoteIndexBlobId : undefined,
    remoteIndexTarget: typeof raw.remoteIndexTarget === "string" ? raw.remoteIndexTarget : undefined,
    remoteIndexUpdated: typeof raw.remoteIndexUpdated === "boolean" ? raw.remoteIndexUpdated : undefined,
    remoteIndexReadBack: typeof raw.remoteIndexReadBack === "boolean" ? raw.remoteIndexReadBack : undefined,
    ownerReadable: typeof raw.ownerReadable === "boolean" ? raw.ownerReadable : undefined,
    remoteSyncStatus:
      raw.remoteSyncStatus === "remote_synced" ||
      raw.remoteSyncStatus === "sync_pending" ||
      raw.remoteSyncStatus === "local_only"
        ? raw.remoteSyncStatus
        : undefined,
    deliveryStatus:
      raw.deliveryStatus === "stored_local" ||
      raw.deliveryStatus === "stored_walrus" ||
      raw.deliveryStatus === "inbox_pending" ||
      raw.deliveryStatus === "inbox_synced"
        ? raw.deliveryStatus
        : raw.remoteSyncStatus === "remote_synced"
          ? "inbox_synced"
          : raw.remoteSyncStatus === "sync_pending"
            ? "inbox_pending"
            : raw.remoteSyncStatus === "local_only"
              ? "stored_local"
              : undefined,
    deliveryStatuses: Array.isArray(raw.deliveryStatuses)
      ? raw.deliveryStatuses.filter(
          (status): status is NonNullable<Submission["deliveryStatus"]> =>
            status === "stored_local" ||
            status === "stored_walrus" ||
            status === "inbox_pending" ||
            status === "inbox_synced",
        )
      : raw.deliveryStatus === "stored_local" ||
          raw.deliveryStatus === "stored_walrus" ||
          raw.deliveryStatus === "inbox_pending" ||
          raw.deliveryStatus === "inbox_synced"
        ? [raw.deliveryStatus]
        : undefined,
    revokeRequested: raw.revokeRequested === true ? true : undefined,
    revokeRequestedAt: typeof raw.revokeRequestedAt === "string" ? raw.revokeRequestedAt : undefined,
    revokeReason: typeof raw.revokeReason === "string" ? raw.revokeReason : undefined,
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
    walrusProof: normalizeWalrusProof(raw.walrusProof, typeof raw.blobId === "string" ? raw.blobId : undefined),
    tatumStorage: normalizeTatumStorageRecord(raw.tatumStorage, typeof raw.blobId === "string" ? raw.blobId : undefined),
  } satisfies Submission;
}

export function normalizeForm(raw: FormSchema | (Record<string, unknown> & { id: string })) {
  const rawFields = Array.isArray(raw.fields) ? (raw.fields as FormField[]) : [];
  const defaultMatrixRows = ["UI", "UX", "Performance"];
  const defaultMatrixColumns = ["Poor", "Okay", "Good"];
  const normalizedForm = {
    ...raw,
    baseFormId: typeof raw.baseFormId === "string" ? raw.baseFormId : raw.id,
    formVersion: resolveFormVersion(raw),
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
          rows:
            fieldType === "matrix"
              ? (Array.isArray(field.rows) ? field.rows : defaultMatrixRows).map((row) => String(row).trim()).filter(Boolean)
              : undefined,
          columns:
            fieldType === "matrix"
              ? (Array.isArray(field.columns) ? field.columns : defaultMatrixColumns).map((column) => String(column).trim()).filter(Boolean)
              : undefined,
          selectionMode: fieldType === "matrix" ? "single" : undefined,
          visibilityRules: normalizeLogicGroup(field.visibilityRules),
          requiredRules: normalizeLogicGroup(field.requiredRules),
        };
      }),
    ),
    sections: Array.isArray(raw.sections) ? (raw.sections as FormSection[]) : [],
    purpose: normalizeFormPurpose(raw.purpose),
    analysisProfileId: normalizeAnalysisProfileId(raw.analysisProfileId),
    signalType: normalizeSignalType(raw.signalType),
    analystType: normalizeAnalystType(raw.analystType),
    analysisType: normalizeAnalysisType(raw.analysisType),
    visibility: normalizeFormVisibility(raw.visibility, raw.publicExplore),
    identityPolicy: normalizeFormIdentityPolicy(raw.identityPolicy),
    locationRequirement: normalizeFormLocationRequirement(raw.locationRequirement),
    publicExplore: raw.publicExplore === true || normalizeFormVisibility(raw.visibility, raw.publicExplore) === "public",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    ownerAddress: typeof raw.ownerAddress === "string" ? raw.ownerAddress : undefined,
    creationMode: raw.creationMode === "guest" || raw.creationMode === "admin" ? raw.creationMode : undefined,
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
    tatumStorage: normalizeTatumStorageRecord(raw.tatumStorage, typeof raw.blobId === "string" ? raw.blobId : undefined),
    activityEvents: Array.isArray(raw.activityEvents)
      ? raw.activityEvents
          .map((event) => normalizeActivityEvent(event as Record<string, unknown>))
          .filter((event): event is NonNullable<ReturnType<typeof normalizeActivityEvent>> => Boolean(event))
      : undefined,
  } satisfies Omit<FormSchema, "schemaHash"> & { schemaHash?: string };

  return {
    ...normalizedForm,
    schemaHash:
      typeof raw.schemaHash === "string" && raw.schemaHash.trim()
        ? raw.schemaHash
        : computeSchemaHash(normalizedForm),
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
): Promise<ResolvedSubmissionAnswers> {
  const encryptedPayloadBlobIds = Array.from(
    new Set(
      [
        submission.encryptedBlobId,
        submission.receiptBlobId,
        submission.isEncrypted ? submission.blobId : undefined,
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );
  const encryptedPayloadBlobId = encryptedPayloadBlobIds[0];

  if (submission.isEncrypted && (submission.encryptedPayload || encryptedPayloadBlobId)) {
    let activeDiagnostics: ReturnType<typeof buildDecryptDiagnosticContext> | undefined;
    try {
      const baseDiagnostics = buildDecryptDiagnosticContext(form, submission, context);
      activeDiagnostics = baseDiagnostics;
      context.onStatusChange?.("loading_seal_runtime");
      logDecryptDiagnostic("start", baseDiagnostics);
      if (!submission.encryptedPayload && !encryptedPayloadBlobId) {
        throw createMissingEncryptedPayloadError("Encrypted payload is missing.", baseDiagnostics);
      }
      let payload = submission.encryptedPayload ?? null;
      if (!payload) {
        for (const candidateBlobId of encryptedPayloadBlobIds) {
          payload = await storageAdapter.readEncryptedPayload(candidateBlobId);
          if (payload) {
            break;
          }
        }
      }
      if (!payload) {
        throw new DecryptDiagnosticError(
          encryptedPayloadBlobId ? "BLOB_FETCH_FAILED" : "ENCRYPTED_PAYLOAD_MISSING",
          encryptedPayloadBlobId
            ? "Failed to fetch encrypted payload from Walrus."
            : "Encrypted payload is missing.",
          baseDiagnostics,
        );
      }
      const envelope = validateEncryptedPayloadOrThrow(payload, baseDiagnostics);
      context.onStatusChange?.("validating_access_policy");
      const decryptPolicySnapshot = buildSealDecryptPolicySnapshot({
        envelope,
        context,
      });
      const encryptPolicySnapshot =
        normalizeStoredSealPolicySnapshot(envelope.encryptPolicySnapshot) ??
        buildSealEncryptPolicySnapshotFromEnvelope(envelope);
      const policySnapshotComparison = compareSealPolicySnapshots(
        encryptPolicySnapshot,
        decryptPolicySnapshot,
      );
      const diagnostics = {
        ...baseDiagnostics,
        packageId: envelope.packageId,
        policyHash: decryptPolicySnapshot.policyHash,
        policyId: envelope.policyId,
        capabilityType: decryptPolicySnapshot.capabilityType,
        accessObjectId: envelope.objectId,
        policyObjectId: envelope.policyObjectId,
        approvalPolicy: envelope.policyId,
        encryptPolicySnapshot,
        decryptPolicySnapshot,
        normalizedPolicyJson: decryptPolicySnapshot.normalizedPolicyJson,
        policySerializationOutput: decryptPolicySnapshot.normalizedPolicyJson,
        policySnapshotComparison,
        requiredCapabilityObjects: [
          {
            type: decryptPolicySnapshot.capabilityType,
            objectId: decryptPolicySnapshot.policyObjectId,
          },
        ],
        objectIdSources: [
          ...(baseDiagnostics.objectIdSources ?? []),
          {
            label: "encrypted payload object ID",
            objectId: envelope.objectId,
            source: submission.encryptedPayload ? "local cache" : "encrypted payload envelope",
            type: "Seal encrypted object",
          },
          {
            label: "envelope policy object ID",
            objectId: envelope.policyObjectId,
            source: submission.encryptedPayload ? "local cache" : "encrypted payload envelope",
            type: "Seal policy object",
          },
          {
            label: "encrypt policy object ID",
            objectId: envelope.encryptPolicySnapshot?.objectId,
            source: "encrypt policy",
            type: "Seal encrypted object",
          },
          {
            label: "encrypt policy policy object ID",
            objectId: envelope.encryptPolicySnapshot?.policyObjectId,
            source: "encrypt policy",
            type: envelope.encryptPolicySnapshot?.capabilityType,
          },
          {
            label: "decrypt policy object ID",
            objectId: decryptPolicySnapshot.objectId,
            source: "decrypt policy",
            type: "Seal encrypted object",
          },
          {
            label: "decrypt policy policy object ID",
            objectId: decryptPolicySnapshot.policyObjectId,
            source: "decrypt policy",
            type: decryptPolicySnapshot.capabilityType,
          },
        ].filter((entry) => entry.objectId),
        encryptedPayloadShape: describeEncryptedPayloadShape(payload),
        ciphertextSize: envelope.encryptedObject.length,
      };
      activeDiagnostics = diagnostics;
      assertEnvelopePolicyMatchesForm(form, envelope, diagnostics);
      logDecryptDiagnostic("payload_validated", diagnostics);
      const decryptedResult = await decryptSensitiveResponse(payload, context, seal, {
        encryptedMarker: true,
        diagnostics,
      });
      const decrypted = decryptedResult.plaintext;
      let parsed: {
        answers?: Record<string, unknown>;
        attachments?: Submission["attachments"];
        location?: SubmissionLocation;
        metadata?: Submission["metadata"];
      };
      try {
        parsed = JSON.parse(decrypted) as {
          answers?: Record<string, unknown>;
          attachments?: Submission["attachments"];
          location?: SubmissionLocation;
          metadata?: Submission["metadata"];
        };
      } catch (error) {
        throw new DecryptDiagnosticError(
          "MANIFEST_MISMATCH",
          error instanceof Error
            ? `Failed to parse decrypted submission payload: ${error.message}`
            : "Failed to parse decrypted submission payload.",
          diagnostics,
          error,
        );
      }
      context.onStatusChange?.("signal_unlocked");
      logDecryptDiagnostic("success", diagnostics);
      return {
        answers: parsed.answers ?? {},
        attachments:
          parsed.attachments === undefined
            ? submission.attachments
            : normalizeSubmissionAttachments(parsed.attachments),
        location: normalizeSubmissionLocation(parsed.location),
        metadata: parsed.metadata,
        legacyUnencrypted: decryptedResult.legacyUnencrypted,
      };
    } catch (error) {
      const reasonCode = classifyDecryptError(error);
      const diagnostics =
        error instanceof DecryptDiagnosticError
          ? error.diagnostics
          : activeDiagnostics ?? buildDecryptDiagnosticContext(form, submission, context);
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

  if (submission.isEncrypted) {
    const diagnostics = buildDecryptDiagnosticContext(form, submission, context);
    throw createMissingEncryptedPayloadError("Encrypted payload is missing.", diagnostics);
  }

  const decryptedAnswers = await decryptSensitiveAnswers(form, submission.answers, seal, context);
  return {
    answers: decryptedAnswers,
    attachments: submission.attachments,
    location: submission.location,
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
    onPipelineStage?: (stage: "encrypting" | "uploading_to_walrus") => void;
  },
): Promise<SaveSubmissionWithEncryptionResult> {
  if (isResponseDeadlinePassed(form.responseDeadline)) {
    throw new Error(messages?.responseDeadlinePassed ?? "This form is no longer accepting responses.");
  }

  const isFullyEncrypted = form.encryptSubmissions === true;
  const formVersion = resolveFormVersion(form);
  const schemaHash = form.schemaHash || computeSchemaHash(form);
  const submissionVersionMetadata = {
    formVersion,
    formBlobId: form.blobId,
    schemaHash,
    manifestBlobId: form.manifestBlobId,
  };
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
    ...submissionVersionMetadata,
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
    if (isProductionProtectedStorageUnavailable(targetStorage)) {
      throw createEncryptionGuardError(ENCRYPTION_REQUIRED_CODE, ENCRYPTION_REQUIRED_MESSAGE);
    }
    if (!form.projectId?.trim() && !form.ownerAddress?.trim()) {
      throw new Error(REAL_SEAL_PROJECT_REQUIRED_MESSAGE);
    }

    assertEncryptedSubmissionAttachments(submission.attachments);

    let encryptedBlobId = submission.encryptedBlobId;
    let encryptedPayload = submission.encryptedPayload;
    try {
      if (!encryptedPayload) {
        const payload = JSON.stringify({
          answers: submission.answers,
          attachments: submission.attachments,
          location: submission.location,
          metadata: submission.metadata,
        });
        messages?.onPipelineStage?.("encrypting");
        encryptedPayload = await encryptSensitiveResponse(
          payload,
          { projectId: form.projectId, ownerAddress: form.ownerAddress },
          seal,
        );
      }
      if (!encryptedBlobId && targetStorage.saveEncryptedSubmission) {
        const parsedEnvelope = parseRealSealEnvelope(encryptedPayload);
        if (!parsedEnvelope) {
          throw createEncryptionGuardError(ENCRYPTION_FAILED_CODE, ENCRYPTION_FAILED_MESSAGE);
        }
        const sealIdentity = `seal:${parsedEnvelope.packageId}:${parsedEnvelope.objectId}`;
        const metadataSubmission = sanitizeSubmissionForStorage(
          {
            ...triagedSubmission,
            isEncrypted: true,
            encryptedBlobId: undefined,
            encryptedPayload,
            sealIdentity,
          },
          { allowEncryptedPayload: true },
        );
        messages?.onPipelineStage?.("uploading_to_walrus");
        const saved = await targetStorage.saveEncryptedSubmission(metadataSubmission);
        return {
          ...saved,
          ...submissionVersionMetadata,
          encryptedBlobId: saved.encryptedBlobId ?? saved.blobId,
          encryptedPayload,
          sealIdentity,
          encryptedWalrusProof: saved.walrusProof,
        };
      }
      if (!encryptedBlobId) {
        messages?.onPipelineStage?.("uploading_to_walrus");
        const savedEncryptedPayload = await targetStorage.saveEncryptedPayload(encryptedPayload);
        encryptedBlobId = savedEncryptedPayload.blobId;
        const encryptedWalrusProof = savedEncryptedPayload.walrusProof;
        const parsedEnvelope = parseRealSealEnvelope(encryptedPayload);
        if (!parsedEnvelope) {
          throw createEncryptionGuardError(ENCRYPTION_FAILED_CODE, ENCRYPTION_FAILED_MESSAGE);
        }
        const sealIdentity = `seal:${parsedEnvelope.packageId}:${parsedEnvelope.objectId}`;
        const metadataSubmission = sanitizeSubmissionForStorage({
          ...triagedSubmission,
          isEncrypted: true,
          encryptedBlobId,
          encryptedWalrusProof,
          encryptedPayload: undefined,
          sealIdentity,
        });
        messages?.onPipelineStage?.("uploading_to_walrus");
        const saved = await targetStorage.saveSubmission(metadataSubmission);
        return {
          ...saved,
          ...submissionVersionMetadata,
          encryptedBlobId: encryptedBlobId ?? saved.blobId,
          encryptedPayload,
          sealIdentity,
          encryptedWalrusProof,
        };
      }
      const parsedEnvelope = parseRealSealEnvelope(encryptedPayload);
      if (!parsedEnvelope) {
        throw createEncryptionGuardError(ENCRYPTION_FAILED_CODE, ENCRYPTION_FAILED_MESSAGE);
      }
      const sealIdentity = `seal:${parsedEnvelope.packageId}:${parsedEnvelope.objectId}`;
      const metadataSubmission = sanitizeSubmissionForStorage({
        ...triagedSubmission,
        isEncrypted: true,
        encryptedBlobId,
        encryptedPayload: undefined,
        sealIdentity,
      });
      messages?.onPipelineStage?.("uploading_to_walrus");
      const saved = await targetStorage.saveSubmission(metadataSubmission);
      return {
        ...saved,
        ...submissionVersionMetadata,
        encryptedBlobId: encryptedBlobId ?? saved.blobId,
        encryptedPayload,
        sealIdentity,
      };
    } catch (error) {
      if (error instanceof Error && (error as Error & { code?: string }).code) {
        throw error;
      }
      throw createEncryptionGuardError(
        ENCRYPTION_FAILED_CODE,
        error instanceof Error ? error.message : ENCRYPTION_FAILED_MESSAGE,
      );
    }
  }

  const answers = await encryptSensitiveAnswers(form, submission.answers, seal, {
    projectId: form.projectId,
    ownerAddress: form.ownerAddress,
  });
  const standardSubmission: Submission = {
    ...triagedSubmission,
    answers,
    isEncrypted: false,
    encryptedBlobId: undefined,
    encryptedPayload: undefined,
    sealIdentity: undefined,
  };
  messages?.onPipelineStage?.("uploading_to_walrus");
  const saved = await targetStorage.saveSubmission(standardSubmission);
  return {
    ...saved,
    ...submissionVersionMetadata,
  };
}
