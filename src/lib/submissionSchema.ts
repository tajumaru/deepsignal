import { LEGACY_SCHEMA_HASH, resolveFormVersion } from "./formVersioning";
import { SUI_NETWORK } from "./sui";
import { getWalrusNetwork } from "./walrusProof";
import type {
  Submission,
  SubmissionAttachment,
  SubmissionLocation,
  TatumStorageRecord,
  WalrusBlobProof,
} from "../types";

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

function normalizeProcessingMode(processingMode: unknown): NonNullable<Submission["processingMode"]> {
  return processingMode === "auto_process" || processingMode === "hybrid" || processingMode === "review_required"
    ? processingMode
    : "review_required";
}

function normalizeReviewState(
  reviewState: unknown,
  processingMode: NonNullable<Submission["processingMode"]>,
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
  processingMode: NonNullable<Submission["processingMode"]>,
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
  processingMode: NonNullable<Submission["processingMode"]>,
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

function coerceSeverity(severity: unknown): Submission["severity"] {
  if (
    severity === "low" ||
    severity === "medium" ||
    severity === "high" ||
    severity === "warning" ||
    severity === "error" ||
    severity === "critical"
  ) {
    return severity;
  }
  return undefined;
}

export function normalizeSubmission(
  raw: Submission | (Record<string, unknown> & { id: string; formId: string; createdAt: string }),
) {
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
  const processingMode = normalizeProcessingMode(raw.processingMode);
  const isEncrypted = Boolean(raw.isEncrypted);

  return {
    id: raw.id,
    formId: raw.formId,
    kind: raw.kind === "system_error" ? "system_error" : undefined,
    source: raw.source === "deepsignal-runtime" ? "deepsignal-runtime" : undefined,
    systemSeverity:
      raw.systemSeverity === "warning" || raw.systemSeverity === "error" || raw.systemSeverity === "critical"
        ? raw.systemSeverity
        : undefined,
    formVersion: resolveFormVersion(raw),
    formBlobId: typeof raw.formBlobId === "string" ? raw.formBlobId : undefined,
    schemaHash: typeof raw.schemaHash === "string" && raw.schemaHash.trim() ? raw.schemaHash : LEGACY_SCHEMA_HASH,
    manifestBlobId: typeof raw.manifestBlobId === "string" ? raw.manifestBlobId : undefined,
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
    processingMode,
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
    reviewState: normalizeReviewState(raw.reviewState, processingMode),
    visibilityState: normalizeVisibilityState(raw.visibilityState, processingMode),
    insightEligibility: normalizeInsightEligibility(raw.insightEligibility, processingMode, isEncrypted),
    insightPayload: normalizeInsightPayload(raw.insightPayload),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    notes: legacyNotes,
    contributorId: typeof raw.contributorId === "string" ? raw.contributorId : undefined,
    responderSignature: typeof raw.responderSignature === "string" ? raw.responderSignature : undefined,
    responderSignedBytes: typeof raw.responderSignedBytes === "string" ? raw.responderSignedBytes : undefined,
    responderSignedAt: typeof raw.responderSignedAt === "string" ? raw.responderSignedAt : undefined,
    signalValue: coerceSignalValue(raw.signalValue),
    githubIssueUrl: typeof raw.githubIssueUrl === "string" ? raw.githubIssueUrl : undefined,
    githubPrUrl: typeof raw.githubPrUrl === "string" ? raw.githubPrUrl : undefined,
    isEncrypted,
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
