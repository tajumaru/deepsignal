import type { UploadDropzoneItem } from "../../../components/UploadDropzone";
import { isConfirmationCheckboxField } from "../../../lib/fieldTypes";
import { getSuiAddressValidationState } from "../../../lib/suiAddress";
import type { FormSchema, SubmissionLocation } from "../../../types";
import { isFieldRequired } from "../../../utils/formLogic";
import type { PublicAnswers, PublicVoiceAnswerDraft, ValidationErrors } from "../types";
import { getUploadAnswer } from "./getUploadAnswer";

type ValidatePublicSubmissionArgs = {
  form: FormSchema;
  answers: PublicAnswers;
  visibleFieldIds: Set<string>;
  attachmentFields: Set<string>;
  requiredFieldError: string;
};

export function isValidUrlAnswer(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return true;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isCompleteMatrixAnswer(value: unknown, rows: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const answer = value as Record<string, unknown>;
  return rows.every((row) => typeof answer[row] === "string" && String(answer[row]).trim().length > 0);
}

function canUseInlineEncryptedAttachment(form: FormSchema, fieldId: string) {
  return Boolean(form.encryptSubmissions && form.fields.some((field) => field.id === fieldId));
}

function hasPendingAttachmentUpload(items: UploadDropzoneItem[]) {
  return items.some((attachment) => attachment.status === "pending" || attachment.status === "uploading");
}

function hasFailedAttachmentUpload(items: UploadDropzoneItem[]) {
  return items.some((attachment) => attachment.status === "failed");
}

function isInvalidWalletAddressAnswer(value: unknown) {
  return Boolean(value) && getSuiAddressValidationState(value) === "invalid";
}

function hasVoiceAnswer(value: unknown): value is PublicVoiceAnswerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const answer = value as Partial<PublicVoiceAnswerDraft>;
  return (
    answer.kind === "voice" &&
    typeof answer.duration === "number" &&
    answer.duration > 0 &&
    typeof answer.mimeType === "string" &&
    Boolean(answer.audioUrl || answer.audioBlobId || answer.blob)
  );
}

export function validatePublicSubmission({
  form,
  answers,
  visibleFieldIds,
  attachmentFields,
  requiredFieldError,
}: ValidatePublicSubmissionArgs): ValidationErrors {
  const nextErrors: ValidationErrors = {};

  form.fields.forEach((field) => {
    const visible = visibleFieldIds.has(field.id);
    const value = answers[field.id];
    const matrixRows = field.type === "matrix" ? (field.rows ?? []).map((row) => row.trim()).filter(Boolean) : [];
    const uploadItems = attachmentFields.has(field.id) ? getUploadAnswer(value) : [];
    const usesInlineEncryptedAttachments = canUseInlineEncryptedAttachment(form, field.id);

    if (attachmentFields.has(field.id) && !usesInlineEncryptedAttachments && hasPendingAttachmentUpload(uploadItems)) {
      nextErrors[field.id] = "Attachment upload is still in progress. Wait for the Walrus blob ID before sending.";
      return;
    }

    if (attachmentFields.has(field.id) && hasFailedAttachmentUpload(uploadItems)) {
      nextErrors[field.id] = "Attachment upload failed. Remove the failed file or select it again.";
      return;
    }

    if (!isFieldRequired(field, form.fields, answers, visible)) {
      if (field.type === "url" && value && !isValidUrlAnswer(value)) {
        nextErrors[field.id] = "Enter a valid URL starting with http:// or https://";
      }
      if (field.type === "walletAddress" && isInvalidWalletAddressAnswer(value)) {
        nextErrors[field.id] = "Enter a valid SUI address.";
      }
      return;
    }

    const missing =
      value === "" ||
      value === null ||
      value === undefined ||
      (isConfirmationCheckboxField(field.type) && value !== true) ||
      (field.type === "matrix" && !isCompleteMatrixAnswer(value, matrixRows)) ||
      (field.type === "voice" && !hasVoiceAnswer(value)) ||
      (Array.isArray(value) && value.length === 0) ||
      (attachmentFields.has(field.id) &&
        (usesInlineEncryptedAttachments
          ? uploadItems.filter((attachment) => attachment.status !== "failed" && (attachment.file || attachment.walrusBlobId))
              .length === 0
          : uploadItems.filter((attachment) => attachment.status === "uploaded" && attachment.walrusBlobId).length === 0));

    if (missing) {
      nextErrors[field.id] = requiredFieldError;
      return;
    }

    if (field.type === "url" && value && !isValidUrlAnswer(value)) {
      nextErrors[field.id] = "Enter a valid URL starting with http:// or https://";
    }
    if (field.type === "walletAddress" && isInvalidWalletAddressAnswer(value)) {
      nextErrors[field.id] = "Enter a valid SUI address.";
    }
  });

  return nextErrors;
}

export function validateSubmissionLocation(
  form: FormSchema,
  location: SubmissionLocation | undefined,
  requiredLocationError: string,
) {
  if (form.locationRequirement !== "required") {
    return "";
  }
  return location ? "" : requiredLocationError;
}
