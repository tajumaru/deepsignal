import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { UploadDropzoneItem } from "../../../components/UploadDropzone";
import { getSealRuntimeStatus } from "../../../crypto/cryptoFactory";
import { isAttachmentFieldType, isConfirmationCheckboxField } from "../../../lib/fieldTypes";
import { getSubmissionCategoryFromPurpose } from "../../../lib/formTemplates";
import { isResponseDeadlinePassed } from "../../../lib/responseDeadline";
import { ensureRespondentSession } from "../../../lib/respondentSession";
import {
  createInlinePrivateAttachment,
  saveSubmissionWithEncryption,
  storageAdapter,
} from "../../../lib/storage";
import { isLocalFallbackBlob } from "../../../lib/signalInbox";
import { makeId } from "../../../lib/utils";
import type { FormSchema, Submission, SubmissionAttachment } from "../../../types";
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../../../utils/formLogic";
import type { PublicAnswers, ValidationErrors } from "../types";

const REAL_SEAL_PROJECT_REQUIRED_MESSAGE =
  "Real Seal encrypted submissions require a selected project. Choose a project or turn off Encrypt submissions.";

export const SIGNAL_PIPELINE_STAGES = [
  "preparing_signal",
  "encrypting",
  "uploading_to_walrus",
  "confirming_blob",
  "generating_manifest",
  "signal_secured",
] as const;

export type SignalPipelineStage = (typeof SIGNAL_PIPELINE_STAGES)[number];
export type SignalPipelineStatus = "idle" | "active" | "failed" | "complete";

export interface SignalPipelineState {
  stage: SignalPipelineStage;
  status: SignalPipelineStatus;
  message?: string;
}

function getUploadAnswer(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is UploadDropzoneItem => Boolean(item) && typeof item === "object" && "id" in item)
    : [];
}

function isValidUrlAnswer(value: unknown) {
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

function getAttachmentType(file: File): SubmissionAttachment["type"] {
  if (file.type.startsWith("video/")) {
    return "video";
  }
  if (file.type.startsWith("image/")) {
    return "image";
  }
  return "document";
}

function createPseudoProgress(onTick: (progress: number) => void) {
  let progress = 8;
  onTick(progress);
  return window.setInterval(() => {
    progress = Math.min(progress + (progress < 60 ? 12 : progress < 85 ? 6 : 2), 94);
    onTick(progress);
  }, 180);
}

function formatUploadFailure(fieldLabel: string, error: unknown) {
  const detail = error instanceof Error ? error.message : "Upload failed.";
  return `${fieldLabel}: ${detail} Remove the failed file or retry before sending your signal.`;
}

function pausePipelineStep(durationMs = 220) {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

interface UsePublicSubmissionArgs {
  form: FormSchema | null;
  initialAnswers: PublicAnswers;
  accountAddress?: string;
  attachWallet: boolean;
  walletRequired: boolean;
  manifestBlobId: string;
  requiredFieldError: string;
  responseDeadlinePassedLabel: string;
  localFallbackNotice: string;
  suiRegistrationDeferredNotice: string;
  submitFailedLabel: string;
}

export function usePublicSubmission({
  form,
  initialAnswers,
  accountAddress,
  attachWallet,
  walletRequired,
  manifestBlobId,
  requiredFieldError,
  responseDeadlinePassedLabel,
  localFallbackNotice,
  suiRegistrationDeferredNotice,
  submitFailedLabel,
}: UsePublicSubmissionArgs) {
  const [answers, setAnswers] = useState<PublicAnswers>(initialAnswers);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");
  const [submitPipeline, setSubmitPipeline] = useState<SignalPipelineState>({
    stage: "preparing_signal",
    status: "idle",
  });

  useEffect(() => {
    setAnswers(initialAnswers);
    setErrors({});
    setSubmitted(null);
    setSubmitError("");
    setSubmitNotice("");
    setSubmitPipeline({ stage: "preparing_signal", status: "idle" });
  }, [initialAnswers]);

  const attachmentFields = useMemo(
    () =>
      new Set(
        form?.fields
          .filter((field) => isAttachmentFieldType(field.type))
          .map((field) => field.id) ?? [],
      ),
    [form],
  );

  const visibleFieldIds = useMemo(
    () => (form ? getVisibleFieldIds(form.fields, answers) : new Set<string>()),
    [answers, form],
  );

  useEffect(() => {
    setErrors((current) => {
      const nextEntries = Object.entries(current).filter(([fieldId, message]) => visibleFieldIds.has(fieldId) || !message);
      return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries);
    });
  }, [visibleFieldIds]);

  function updateAnswer(fieldId: string, value: unknown) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => ({ ...current, [fieldId]: "" }));
  }

  function validate(currentForm: FormSchema) {
    const nextErrors: ValidationErrors = {};
    currentForm.fields.forEach((field) => {
      const visible = visibleFieldIds.has(field.id);
      const value = answers[field.id];
      const uploadItems = attachmentFields.has(field.id) ? getUploadAnswer(value) : [];
      if (!isFieldRequired(field, currentForm.fields, answers, visible)) {
        if (field.type === "url" && value && !isValidUrlAnswer(value)) {
          nextErrors[field.id] = "Enter a valid URL starting with http:// or https://";
        }
        return;
      }
      const missing =
        value === "" ||
        value === null ||
        value === undefined ||
        (isConfirmationCheckboxField(field.type) && value !== true) ||
        (Array.isArray(value) && value.length === 0) ||
        (attachmentFields.has(field.id) &&
          uploadItems.filter((attachment) => attachment.status !== "failed").length === 0);
      if (missing) {
        nextErrors[field.id] = requiredFieldError;
        return;
      }
      if (field.type === "url" && value && !isValidUrlAnswer(value)) {
        nextErrors[field.id] = "Enter a valid URL starting with http:// or https://";
      }
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.requestAnimationFrame(() => {
        const firstInvalidFieldId = currentForm.fields.find((field) => nextErrors[field.id])?.id;
        if (!firstInvalidFieldId) {
          return;
        }
        const fieldElement = document.querySelector<HTMLElement>(`[data-field-id="${firstInvalidFieldId}"]`);
        if (!fieldElement) {
          return;
        }
        fieldElement.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusTarget = fieldElement.querySelector<HTMLElement>("input, textarea, select, button");
        focusTarget?.focus({ preventScroll: true });
      });
    }
    return Object.keys(nextErrors).length === 0;
  }

  function activatePipeline(stage: SignalPipelineStage, message?: string) {
    setSubmitPipeline({ stage, status: "active", message });
  }

  function failPipeline(message: string) {
    setSubmitPipeline((current) => ({
      ...current,
      status: "failed",
      message,
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form || submitting) {
      return;
    }
    if (isResponseDeadlinePassed(form.responseDeadline)) {
      setSubmitError("This signal intake is closed because the response deadline has passed.");
      setSubmitNotice("");
      return;
    }
    const sealRuntime = getSealRuntimeStatus();
    if (form.encryptSubmissions && sealRuntime.activeMode === "seal" && !form.projectId?.trim()) {
      setSubmitError(REAL_SEAL_PROJECT_REQUIRED_MESSAGE);
      setSubmitNotice("");
      return;
    }
    if (walletRequired && !accountAddress) {
      setSubmitError("This form requires a connected wallet before you can submit.");
      setSubmitNotice("");
      return;
    }
    if (!validate(form)) {
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setSubmitNotice("");
    activatePipeline("preparing_signal", "Preparing your message for secure delivery.");
    try {
      const signedAt = new Date().toISOString();
      const isAnonymous = walletRequired ? false : !attachWallet || !accountAddress;
      const session = await ensureRespondentSession({
        walletAddress: accountAddress,
        isAnonymous,
      });
      const respondentMeta = {
        walletAddress: isAnonymous ? undefined : accountAddress,
        chain: "sui" as const,
        sessionId: session.sessionId,
        submittedAt: signedAt,
        isAnonymous,
      };
      const attachments: SubmissionAttachment[] = [];
      const plainAnswers: PublicAnswers = {};
      const visibleFields = getOrderedFields(form.fields).filter((field) => visibleFieldIds.has(field.id));

      for (const field of visibleFields) {
        const value = answers[field.id];
        if (attachmentFields.has(field.id)) {
          const fieldUploads = getUploadAnswer(value).filter((attachment) => attachment.file);
          const validUploads = fieldUploads.filter((attachment) => attachment.status !== "failed");

          if (validUploads.length === 0) {
            plainAnswers[field.id] = "";
            continue;
          }

          for (const attachment of validUploads) {
            const file = attachment.file;
            if (!file) {
              continue;
            }

            setAnswers((current) => ({
              ...current,
              [field.id]: getUploadAnswer(current[field.id]).map((item) =>
                item.id === attachment.id ? { ...item, status: "uploading", progress: 0, error: undefined } : item,
              ),
            }));

            const progressTimer = createPseudoProgress((progress) => {
              setAnswers((current) => ({
                ...current,
                [field.id]: getUploadAnswer(current[field.id]).map((item) =>
                  item.id === attachment.id ? { ...item, progress, status: "uploading" } : item,
                ),
              }));
            });

            try {
              if (form.encryptSubmissions) {
                activatePipeline("preparing_signal", `Packing ${file.name} into the protected signal.`);
                const inlineAttachment = await createInlinePrivateAttachment(file);
                window.clearInterval(progressTimer);
                attachments.push({
                  ...inlineAttachment,
                  fieldId: field.id,
                  type: getAttachmentType(file),
                });
                setAnswers((current) => ({
                  ...current,
                  [field.id]: getUploadAnswer(current[field.id]).map((item) =>
                    item.id === attachment.id ? { ...item, status: "uploaded", progress: 100 } : item,
                  ),
                }));
              } else {
                activatePipeline("uploading_to_walrus", `Uploading ${file.name} to Walrus.`);
                const upload = await storageAdapter.uploadFile(file);
                window.clearInterval(progressTimer);
                attachments.push({
                  fieldId: field.id,
                  type: getAttachmentType(file),
                  blobId: upload.blobId,
                  name: file.name,
                  size: file.size,
                  storage: "blob",
                  originalName: file.name,
                  originalType: file.type || "application/octet-stream",
                });
                setAnswers((current) => ({
                  ...current,
                  [field.id]: getUploadAnswer(current[field.id]).map((item) =>
                    item.id === attachment.id
                      ? { ...item, status: "uploaded", progress: 100, walrusBlobId: upload.blobId }
                      : item,
                  ),
                }));
              }
            } catch (error) {
              window.clearInterval(progressTimer);
              const message = formatUploadFailure(field.label || "Attachment", error);
              setAnswers((current) => ({
                ...current,
                [field.id]: getUploadAnswer(current[field.id]).map((item) =>
                  item.id === attachment.id ? { ...item, status: "failed", progress: 0, error: message } : item,
                ),
              }));
              throw new Error(message);
            }
          }

          plainAnswers[field.id] = validUploads.map((attachment) => attachment.fileName).join(", ");
        } else {
          plainAnswers[field.id] = value;
        }
      }

      const publicPayloadAnswers = Object.fromEntries(
        visibleFields.filter((field) => !field.sensitive).map((field) => [field.id, plainAnswers[field.id]]),
      );
      const submission: Submission = {
        id: makeId("submission"),
        formId: form.id,
        answers: plainAnswers,
        attachments,
        publicPayload: form.encryptSubmissions
          ? undefined
          : {
              answers: publicPayloadAnswers,
              attachments,
            },
        respondentMeta,
        category: getSubmissionCategoryFromPurpose(form.purpose),
        status: "unread",
        priority: "medium",
        triageStatus: "new",
        tags: [],
        notes: "",
        contributorId: respondentMeta.walletAddress ?? respondentMeta.sessionId,
        isEncrypted: Boolean(form.encryptSubmissions),
        pendingOnchainRegistration: Boolean(form.projectId),
        createdAt: signedAt,
        updatedAt: signedAt,
      };

      activatePipeline(
        form.encryptSubmissions ? "encrypting" : "preparing_signal",
        form.encryptSubmissions ? "Sealing the private payload for approved reviewers." : "Finalizing the signal envelope.",
      );
      const result = await saveSubmissionWithEncryption(form, submission, undefined, storageAdapter, {
        responseDeadlinePassed: responseDeadlinePassedLabel,
        onPipelineStage(stage) {
          activatePipeline(
            stage,
            stage === "encrypting"
              ? "Sealing the private payload for approved reviewers."
              : "Writing the secured signal to Walrus.",
          );
        },
      });
      activatePipeline(
        "confirming_blob",
        isLocalFallbackBlob(result.blobId) ? "Local fallback accepted the signal." : "Walrus accepted the signal blob.",
      );
      await pausePipelineStep();
      activatePipeline(
        "generating_manifest",
        isLocalFallbackBlob(result.blobId) ? "Updating the local recovery index." : "Updating the recovery manifest.",
      );
      await pausePipelineStep();
      const savedSubmission = {
        ...submission,
        isEncrypted: Boolean(form.encryptSubmissions),
        blobId: result.blobId,
        encryptedBlobId: "encryptedBlobId" in result ? result.encryptedBlobId : undefined,
        encryptedPayload: "encryptedPayload" in result ? result.encryptedPayload : undefined,
        sealIdentity: "sealIdentity" in result ? result.sealIdentity : undefined,
        receiptBlobId: result.blobId ?? undefined,
      } satisfies Submission;
      const notices = [];
      if (manifestBlobId && isLocalFallbackBlob(savedSubmission.encryptedBlobId ?? savedSubmission.blobId)) {
        notices.push(localFallbackNotice);
      }
      if (form.projectId) {
        notices.push(suiRegistrationDeferredNotice);
      }
      setSubmitted(savedSubmission);
      setSubmitNotice(notices.join(" "));
      setSubmitPipeline({ stage: "signal_secured", status: "complete", message: "Signal secured." });
    } catch (error) {
      const message = error instanceof Error ? error.message : submitFailedLabel;
      setSubmitError(message);
      failPipeline(message);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    answers,
    errors,
    submitting,
    submitted,
    submitError,
    submitNotice,
    submitPipeline,
    visibleFieldIds,
    updateAnswer,
    handleSubmit,
  };
}
