import type { EncryptedSubmissionRecord, Submission, SubmissionAttachment } from "../types";

const ENCRYPTED_ATTACHMENT_LABEL = "Encrypted attachment";
export const ENCRYPTED_ATTACHMENT_REQUIRED_MESSAGE =
  "Encrypted attachments are required for protected submissions. Submission was not uploaded.";
export const ENCRYPTED_SUBMISSION_LEAK_GUARD_FAILED = "ENCRYPTED_SUBMISSION_LEAK_GUARD_FAILED";
export const EMBEDDED_ENCRYPTED_PAYLOAD_BLOB_ID = "__embedded_encrypted_payload__";

interface EncryptedSubmissionSanitizerOptions {
  allowEncryptedPayload?: boolean;
}

function createAttachmentMarker(attachment: SubmissionAttachment): SubmissionAttachment {
  return {
    fieldId: attachment.fieldId,
    type: attachment.type,
    blobId: attachment.blobId,
    name: ENCRYPTED_ATTACHMENT_LABEL,
    size: 0,
    storage: attachment.storage,
    encrypted: attachment.encrypted === true ? true : undefined,
    encoding: attachment.encoding,
    walrusProof: attachment.walrusProof,
  };
}

function sanitizeEncryptedSubmissionAttachments(attachments: SubmissionAttachment[]) {
  return attachments.map((attachment) => createAttachmentMarker(attachment));
}

export function assertEncryptedSubmissionAttachments(attachments: SubmissionAttachment[]) {
  const hasUnencryptedAttachment = attachments.some((attachment) => attachment.encrypted !== true);
  if (hasUnencryptedAttachment) {
    throw new Error(ENCRYPTED_ATTACHMENT_REQUIRED_MESSAGE);
  }
}

function isObjectEmpty(value: Record<string, unknown> | undefined) {
  return !value || Object.keys(value).length === 0;
}

export function assertEncryptedSubmissionLeakGuard(
  submission: Submission,
  options: EncryptedSubmissionSanitizerOptions = {},
): asserts submission is EncryptedSubmissionRecord {
  if (submission.isEncrypted !== true) {
    return;
  }

  const answersAreEmpty = Object.keys(submission.answers).length === 0;
  const hasEncryptedPayload = typeof submission.encryptedPayload === "string" && submission.encryptedPayload.trim().length > 0;
  const hasEncryptedBlobId =
    (typeof submission.encryptedBlobId === "string" && submission.encryptedBlobId.trim().length > 0) ||
    (options.allowEncryptedPayload === true && hasEncryptedPayload);
  const hasStoredEncryptedPayload = submission.encryptedPayload !== undefined;
  const hasUnencryptedBlobAttachment = submission.attachments.some(
    (attachment) => attachment.storage === "blob" && attachment.encrypted !== true,
  );
  const metadataIsSafe = isObjectEmpty(submission.metadata);
  const aiSummaryIsSafe = submission.aiSummary === undefined;
  const embeddingIsSafe = submission.embedding === undefined || submission.embedding.length === 0;
  const keywordsAreSafe = submission.keywords === undefined || submission.keywords.length === 0;
  const publicPayloadHasAnswers =
    submission.publicPayload !== undefined &&
    "answers" in submission.publicPayload &&
    submission.publicPayload.answers !== undefined &&
    Object.keys(submission.publicPayload.answers).length > 0;

  if (
    !answersAreEmpty ||
    !hasEncryptedBlobId ||
    (hasStoredEncryptedPayload && !options.allowEncryptedPayload) ||
    hasUnencryptedBlobAttachment ||
    !metadataIsSafe ||
    !aiSummaryIsSafe ||
    !embeddingIsSafe ||
    !keywordsAreSafe ||
    publicPayloadHasAnswers
  ) {
    throw new Error(ENCRYPTED_SUBMISSION_LEAK_GUARD_FAILED);
  }
}

export function sanitizeSubmissionForStorage(
  submission: Submission,
  options: EncryptedSubmissionSanitizerOptions = {},
): Submission | EncryptedSubmissionRecord {
  if (submission.isEncrypted !== true) {
    return submission;
  }

  const sourceAttachments =
    submission.publicPayload?.attachments && submission.publicPayload.attachments.length > 0
      ? submission.publicPayload.attachments
      : submission.attachments;
  const attachments = sanitizeEncryptedSubmissionAttachments(sourceAttachments);
  const redactedSubmission: EncryptedSubmissionRecord = {
    ...submission,
    isEncrypted: true,
    answers: {},
    attachments,
    publicPayload:
      attachments.length > 0 || submission.subjectPreview || submission.ratingValue !== undefined
        ? {
            ...(attachments.length > 0 ? { attachments } : {}),
            ...(submission.subjectPreview ? { subjectPreview: submission.subjectPreview } : {}),
            ...(submission.ratingValue !== undefined ? { ratingValue: submission.ratingValue } : {}),
          }
        : undefined,
    metadata: {},
    encryptedBlobId:
      submission.encryptedBlobId ??
      (options.allowEncryptedPayload && submission.encryptedPayload ? EMBEDDED_ENCRYPTED_PAYLOAD_BLOB_ID : ""),
    encryptedPayload: options.allowEncryptedPayload ? submission.encryptedPayload : undefined,
    aiSummary: undefined,
    severity: undefined,
    emotion: undefined,
    keywords: undefined,
    embedding: undefined,
    clusterId: undefined,
  };

  assertEncryptedSubmissionLeakGuard(redactedSubmission, options);
  return redactedSubmission;
}
