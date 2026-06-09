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
import { isConfirmationCheckboxField, normalizeFieldType } from "./fieldTypes";
import { formatAnswerText } from "./answerFormatting";
import { DEFAULT_ATTACHMENT_MAX_BYTES, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES } from "./attachmentLimits";
import { computeSchemaHash, resolveFormVersion } from "./formVersioning";
import { isResponseWindowClosed } from "./responseDeadline";
import { buildSubmissionInsightPayload } from "./signalProcessing";
import { enrichSubmissionWithTriage } from "./signalTriage";
import { getStorageRuntimeStatus } from "../storage/storageRuntime";
import {
  assertEncryptedSubmissionAttachments,
  sanitizeSubmissionForStorage,
} from "../storage/submissionSanitizer";
import { storageAdapter } from "./storageAdapter";
import { getSubmissionCategoryFromPurpose, inferPriorityFromTemplateAnswers, normalizeFormPurpose } from "./formTemplates";
import { getWalrusNetwork } from "./walrusProof";
import { SUI_NETWORK } from "./sui";
import type {
  FormSchema,
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

export const activeSealAdapter: SealAdapter = sealServiceAdapter;
export const ENCRYPTION_REQUIRED_MESSAGE =
  "Protected submissions require encrypted Walrus storage in production. Response was not submitted.";
export { DEFAULT_ATTACHMENT_MAX_BYTES, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES, getStorageRuntimeStatus, storageAdapter };

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

function normalizeSubmissionAttachments(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [] as SubmissionAttachment[];
  }
  return raw
    .map((attachment) => normalizeSubmissionAttachment(attachment))
    .filter((attachment): attachment is SubmissionAttachment => Boolean(attachment));
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
      return [fieldId, parseSensitiveValue(form, fieldId, plaintext)] as const;
    }),
  );
  return Object.fromEntries(decryptedEntries);
}

function isProductionProtectedStorageUnavailable(targetStorage: StorageAdapter) {
  if (targetStorage !== storageAdapter) {
    return false;
  }
  const runtime = getStorageRuntimeStatus();
  return (
    import.meta.env.PROD &&
    runtime.mode !== "walrus" &&
    !targetStorage.saveEncryptedSubmission &&
    !targetStorage.saveEncryptedPayload
  );
}

function createMissingEncryptedPayloadError(
  message: string,
  diagnostics: ReturnType<typeof buildDecryptDiagnosticContext>,
) {
  return new DecryptDiagnosticError("ENCRYPTED_PAYLOAD_MISSING", message, diagnostics);
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
    throw new DecryptDiagnosticError("POLICY_MISMATCH", "Encryption policy mismatch.", diagnostics);
  }
  if (formProjectId && envelopeProjectId && formProjectId !== envelopeProjectId) {
    throw new DecryptDiagnosticError("POLICY_MISMATCH", "Encryption policy mismatch.", diagnostics);
  }
  if (formOwnerAddress && envelopeOwnerAddress && formOwnerAddress !== envelopeOwnerAddress) {
    throw new DecryptDiagnosticError("POLICY_MISMATCH", "Encryption policy mismatch.", diagnostics);
  }
  if (!envelope.policyId || !envelope.policyObjectId) {
    throw new DecryptDiagnosticError("POLICY_MISMATCH", "Encryption policy mismatch.", diagnostics);
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

function normalizeProcessingMode(processingMode: unknown): NonNullable<FormSchema["processingMode"]> {
  return processingMode === "auto_process" || processingMode === "hybrid" || processingMode === "review_required"
    ? processingMode
    : "review_required";
}

function normalizeReviewState(
  reviewState: unknown,
  processingMode: NonNullable<FormSchema["processingMode"]>,
): Submission["reviewState"] {
  if (
    reviewState === "queued" ||
    reviewState === "in_review" ||
    reviewState === "reviewed" ||
    reviewState === "not_required" ||
    reviewState === "suppressed"
  ) {
    return reviewState;
  }
  return processingMode === "auto_process" ? "not_required" : "queued";
}

function normalizeVisibilityState(
  visibilityState: unknown,
  processingMode: NonNullable<FormSchema["processingMode"]>,
): Submission["visibilityState"] {
  if (
    visibilityState === "private" ||
    visibilityState === "aggregate_only" ||
    visibilityState === "reviewed_public" ||
    visibilityState === "public"
  ) {
    return visibilityState;
  }
  return processingMode === "review_required" ? "private" : "aggregate_only";
}

function normalizeInsightEligibility(
  insightEligibility: unknown,
  processingMode: NonNullable<FormSchema["processingMode"]>,
  isEncrypted: boolean,
): Submission["insightEligibility"] {
  if (
    insightEligibility === "eligible" ||
    insightEligibility === "metadata_only" ||
    insightEligibility === "requires_review" ||
    insightEligibility === "excluded"
  ) {
    return insightEligibility;
  }
  if (isEncrypted) {
    return "metadata_only";
  }
  return processingMode === "auto_process" || processingMode === "hybrid" ? "eligible" : "requires_review";
}

function normalizeInsightPayload(raw: unknown): Submission["insightPayload"] {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const payload = raw as NonNullable<Submission["insightPayload"]>;
  if (typeof payload.generatedAt !== "string") {
    return undefined;
  }
  return {
    answers: payload.answers && typeof payload.answers === "object" ? payload.answers : undefined,
    fieldIds: Array.isArray(payload.fieldIds) ? payload.fieldIds.map(String).filter(Boolean) : undefined,
    redactedFieldIds: Array.isArray(payload.redactedFieldIds)
      ? payload.redactedFieldIds.map(String).filter(Boolean)
      : undefined,
    generatedAt: payload.generatedAt,
  };
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
      const decryptPolicySnapshot = buildSealDecryptPolicySnapshot({ envelope, context });
      const encryptPolicySnapshot =
        normalizeStoredSealPolicySnapshot(envelope.encryptPolicySnapshot) ??
        buildSealEncryptPolicySnapshotFromEnvelope(envelope);
      const policySnapshotComparison = compareSealPolicySnapshots(encryptPolicySnapshot, decryptPolicySnapshot);
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
      throw new DecryptDiagnosticError(reasonCode, `Decrypt failed: ${reasonCode}`, diagnostics, error);
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
  if (isResponseWindowClosed(form.responseOpenAt, form.responseDeadline)) {
    throw new Error(messages?.responseDeadlinePassed ?? "This form is no longer accepting responses.");
  }

  const isFullyEncrypted = form.encryptSubmissions === true;
  const processingMode = normalizeProcessingMode(form.processingMode);
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
  const normalizedInsightPayload = normalizeInsightPayload(submission.insightPayload);
  const baseSubmission: Submission = {
    ...submission,
    ...submissionVersionMetadata,
    processingMode,
    category: submission.category ?? getSubmissionCategoryFromPurpose(normalizeFormPurpose(form.purpose)),
    status: coerceStatus(submission.status),
    priority,
    triageStatus: coerceTriageStatus(submission.triageStatus),
    reviewState: normalizeReviewState(submission.reviewState, processingMode),
    visibilityState: normalizeVisibilityState(submission.visibilityState, processingMode),
    insightEligibility: normalizeInsightEligibility(submission.insightEligibility, processingMode, isFullyEncrypted),
    insightPayload:
      normalizedInsightPayload ??
      buildSubmissionInsightPayload(
        form,
        {
          answers: submission.answers,
          isEncrypted: Boolean(submission.isEncrypted || isFullyEncrypted),
          insightPayload: undefined,
        },
        submission.updatedAt || submission.createdAt || new Date().toISOString(),
      ),
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
  const triageInput = isFullyEncrypted ? { ...baseSubmission, answers: {} } : baseSubmission;
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
