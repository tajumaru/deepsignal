import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { UploadDropzoneItem } from "../../../components/UploadDropzone";
import { getSealRuntimeStatus } from "../../../crypto/cryptoFactory";
import { SEAL_UNAVAILABLE_MESSAGE } from "../../../crypto/sealService";
import {
  buildCriticalFailureDiagnostics,
  createCriticalFailure,
  type CriticalFailure,
} from "../../../lib/criticalFailure";
import { isAttachmentFieldType, isConfirmationCheckboxField } from "../../../lib/fieldTypes";
import { getSubmissionCategoryFromPurpose } from "../../../lib/formTemplates";
import { isResponseDeadlinePassed } from "../../../lib/responseDeadline";
import { ensureRespondentSession } from "../../../lib/respondentSession";
import { collectSignalContext, installSignalContextCapture } from "../../../lib/signalContext";
import {
  activeSealAdapter,
  ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES,
  createEncryptedAttachmentUpload,
  createInlinePrivateAttachment,
  saveSubmissionWithEncryption,
  storageAdapter,
} from "../../../lib/storage";
import { isLocalFallbackBlob } from "../../../lib/signalInbox";
import { makeId } from "../../../lib/utils";
import {
  getWalrusMutationRuntimeStatus,
  subscribeWalrusRuntime,
  waitForWalrusMutationRuntimeReady,
} from "../../../storage/walrusAdapter";
import type { FormSchema, Submission, SubmissionAttachment } from "../../../types";
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../../../utils/formLogic";
import type { PublicAnswers, ValidationErrors } from "../types";

const REAL_SEAL_PROJECT_REQUIRED_MESSAGE =
  "Real Seal encrypted submissions require a project or form owner wallet. Connect the creator wallet or turn off Encrypt submissions.";
const STORAGE_CONNECTION_PREPARING_MESSAGE =
  "Storage connection is still preparing. Please wait a moment and try again.";

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

interface RecoverablePublicDraft {
  answers: PublicAnswers;
  savedAt: string;
}

function createDraftStorageKey(formId: string, manifestBlobId: string) {
  return `deepsignal:public-draft:${formId}:${manifestBlobId || "direct"}`;
}

function hasRecoverableAnswers(answers: PublicAnswers) {
  return Object.values(answers).some((value) => {
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value && typeof value === "object") {
      return Object.keys(value).length > 0;
    }
    return value === true;
  });
}

function sanitizeDraftAnswers(answers: PublicAnswers, attachmentFields: Set<string>) {
  return Object.fromEntries(
    Object.entries(answers).map(([fieldId, value]) => [fieldId, attachmentFields.has(fieldId) ? [] : value]),
  ) satisfies PublicAnswers;
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

function isCompleteMatrixAnswer(value: unknown, rows: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const answer = value as Record<string, unknown>;
  return rows.every((row) => typeof answer[row] === "string" && String(answer[row]).trim().length > 0);
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
  const detail = getUserFacingSubmissionError(error, "Upload failed.");
  return `${fieldLabel}: ${detail} Remove the failed file or retry before sending your signal.`;
}

function pausePipelineStep(durationMs = 220) {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

function isWalrusRuntimePreparingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  return lower.includes("walrus client is not ready yet") || lower.includes("wallet is not ready");
}

function getUserFacingSubmissionError(error: unknown, fallback: string) {
  if (isWalrusRuntimePreparingError(error)) {
    return STORAGE_CONNECTION_PREPARING_MESSAGE;
  }
  return error instanceof Error ? error.message : fallback;
}

function getDiagnosticErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const diagnosticMessage = (error as Error & { diagnosticMessage?: unknown }).diagnosticMessage;
  if (typeof diagnosticMessage === "string" && diagnosticMessage.trim()) {
    return diagnosticMessage;
  }
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause) {
    return getDiagnosticErrorMessage(cause);
  }
  return error.message;
}

interface UsePublicSubmissionArgs {
  form: FormSchema | null;
  initialAnswers: PublicAnswers;
  accountAddress?: string;
  walletProvider?: string | null;
  attachWallet: boolean;
  walletRequired: boolean;
  manifestBlobId: string;
  requiredFieldError: string;
  responseDeadlinePassedLabel: string;
  localFallbackNotice: string;
  suiRegistrationDeferredNotice: string;
  submitFailedLabel: string;
  attachmentTooLargeLabel: (fieldLabel: string, maxSizeBytes: number) => string;
}

export function usePublicSubmission({
  form,
  initialAnswers,
  accountAddress,
  walletProvider,
  attachWallet,
  walletRequired,
  manifestBlobId,
  requiredFieldError,
  responseDeadlinePassedLabel,
  localFallbackNotice,
  suiRegistrationDeferredNotice,
  submitFailedLabel,
  attachmentTooLargeLabel,
}: UsePublicSubmissionArgs) {
  const [answers, setAnswers] = useState<PublicAnswers>(initialAnswers);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");
  const [failure, setFailure] = useState<CriticalFailure | null>(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [hasRecoverableDraft, setHasRecoverableDraft] = useState(false);
  const [walrusRuntime, setWalrusRuntime] = useState(() => getWalrusMutationRuntimeStatus());
  const [submitPipeline, setSubmitPipeline] = useState<SignalPipelineState>({
    stage: "preparing_signal",
    status: "idle",
  });

  useEffect(() => installSignalContextCapture(), []);

  useEffect(() => subscribeWalrusRuntime(() => setWalrusRuntime(getWalrusMutationRuntimeStatus())), []);

  useEffect(() => {
    setAnswers(initialAnswers);
    setErrors({});
    setSubmitted(null);
    setSubmitError("");
    setSubmitNotice("");
    setFailure(null);
    setDiagnosticsCopied(false);
    setHasRecoverableDraft(false);
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
  const draftStorageKey = useMemo(
    () => (form ? createDraftStorageKey(form.id, manifestBlobId) : ""),
    [form, manifestBlobId],
  );

  useEffect(() => {
    if (!draftStorageKey) {
      setHasRecoverableDraft(false);
      return;
    }
    try {
      const rawDraft = window.localStorage.getItem(draftStorageKey);
      setHasRecoverableDraft(Boolean(rawDraft));
    } catch {
      setHasRecoverableDraft(false);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    setErrors((current) => {
      const nextEntries = Object.entries(current).filter(([fieldId, message]) => visibleFieldIds.has(fieldId) || !message);
      return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries);
    });
  }, [visibleFieldIds]);

  function updateAnswer(fieldId: string, value: unknown) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => ({ ...current, [fieldId]: "" }));
    setFailure(null);
  }

  function persistDraft(nextAnswers: PublicAnswers) {
    if (!draftStorageKey || !hasRecoverableAnswers(nextAnswers)) {
      return;
    }
    const payload: RecoverablePublicDraft = {
      answers: sanitizeDraftAnswers(nextAnswers, attachmentFields),
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
    setHasRecoverableDraft(true);
  }

  function clearDraft() {
    if (!draftStorageKey) {
      return;
    }
    window.localStorage.removeItem(draftStorageKey);
    setHasRecoverableDraft(false);
  }

  function restoreDraft() {
    if (!draftStorageKey) {
      return;
    }
    try {
      const rawDraft = window.localStorage.getItem(draftStorageKey);
      if (!rawDraft) {
        setHasRecoverableDraft(false);
        return;
      }
      const draft = JSON.parse(rawDraft) as RecoverablePublicDraft;
      setAnswers((current) => ({ ...current, ...draft.answers }));
      setErrors({});
      setFailure(null);
      setHasRecoverableDraft(false);
    } catch {
      clearDraft();
    }
  }

  function discardDraft() {
    clearDraft();
  }

  async function copyDiagnostics() {
    if (!failure) {
      return;
    }
    try {
      await navigator.clipboard.writeText(buildCriticalFailureDiagnostics(failure));
      setDiagnosticsCopied(true);
      window.setTimeout(() => setDiagnosticsCopied(false), 1800);
    } catch (error) {
      console.error(error);
    }
  }

  function validate(currentForm: FormSchema) {
    const nextErrors: ValidationErrors = {};
    currentForm.fields.forEach((field) => {
      const visible = visibleFieldIds.has(field.id);
      const value = answers[field.id];
      const matrixRows = field.type === "matrix" ? (field.rows ?? []).map((row) => row.trim()).filter(Boolean) : [];
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
        (field.type === "matrix" && !isCompleteMatrixAnswer(value, matrixRows)) ||
        (Array.isArray(value) && value.length === 0) ||
        (attachmentFields.has(field.id) &&
          uploadItems.filter((attachment) => attachment.status !== "failed").length === 0);
      if (missing) {
        nextErrors[field.id] = requiredFieldError;
        return;
      }
      if (currentForm.encryptSubmissions && attachmentFields.has(field.id)) {
        const oversizedAttachment = uploadItems.find((attachment) => attachment.fileSize > ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES);
        if (oversizedAttachment) {
          nextErrors[field.id] = attachmentTooLargeLabel(field.label || "Attachment", ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES);
          return;
        }
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
      setFailure(
        createCriticalFailure({
          error: new Error("This signal intake is closed because the response deadline has passed."),
          surface: "form",
          step: "validation",
          noDataSubmitted: true,
          diagnostics: { formId: form.id },
        }),
      );
      return;
    }
    const sealRuntime = getSealRuntimeStatus();
    if (form.encryptSubmissions && !sealRuntime.canEncrypt) {
      const message = sealRuntime.warning ?? SEAL_UNAVAILABLE_MESSAGE;
      setSubmitError(message);
      setSubmitNotice("");
      setFailure(
        createCriticalFailure({
          error: new Error(message),
          surface: "seal",
          step: "validation",
          noDataSubmitted: true,
          diagnostics: {
            formId: form.id,
            sealRuntime,
          },
        }),
      );
      return;
    }
    if (
      form.encryptSubmissions &&
      sealRuntime.activeMode === "seal" &&
      !form.projectId?.trim() &&
      !form.ownerAddress?.trim()
    ) {
      setSubmitError(REAL_SEAL_PROJECT_REQUIRED_MESSAGE);
      setSubmitNotice("");
      setFailure(
        createCriticalFailure({
          error: new Error(REAL_SEAL_PROJECT_REQUIRED_MESSAGE),
          surface: "seal",
          step: "validation",
          noDataSubmitted: true,
          diagnostics: { formId: form.id },
        }),
      );
      return;
    }
    if (walletRequired && !accountAddress) {
      setSubmitError("This form requires a connected wallet before you can submit.");
      setSubmitNotice("");
      setFailure(
        createCriticalFailure({
          error: new Error("This form requires a connected wallet before you can submit."),
          surface: "wallet",
          step: "validation",
          noDataSubmitted: true,
          diagnostics: { formId: form.id },
        }),
      );
      return;
    }
    if (!validate(form)) {
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setSubmitNotice("");
    setFailure(null);
    setDiagnosticsCopied(false);
    activatePipeline("preparing_signal", "Preparing your message for secure delivery.");
    try {
      if (accountAddress && (walletRequired || attachWallet)) {
        await waitForWalrusMutationRuntimeReady({ requireWallet: true, timeoutMs: 7000 });
      }
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
      const signalContext = collectSignalContext({
        form,
        manifestBlobId,
        walletAddress: accountAddress,
        walletProvider,
      });
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
            const requiresProtectedAttachment = form.encryptSubmissions || field.sensitive;

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
                if (file.size > ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES) {
                  throw new Error(
                    attachmentTooLargeLabel(field.label || file.name || "Attachment", ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES),
                  );
                }
                activatePipeline("preparing_signal", `Packing ${file.name} into the protected signal.`);
                const inlineAttachment = await createInlinePrivateAttachment(file, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES);
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
              } else if (requiresProtectedAttachment) {
                activatePipeline("encrypting", `Encrypting ${file.name} before upload.`);
                const encryptedUpload = await createEncryptedAttachmentUpload(file, activeSealAdapter, {
                  projectId: form.projectId,
                  ownerAddress: form.ownerAddress,
                });
                activatePipeline("uploading_to_walrus", `Uploading protected ${file.name} to Walrus.`);
                const upload = await storageAdapter.uploadFile(encryptedUpload.file);
                window.clearInterval(progressTimer);
                attachments.push({
                  fieldId: field.id,
                  type: getAttachmentType(file),
                  blobId: upload.blobId,
                  name: file.name,
                  size: file.size,
                  storage: "blob",
                  ...encryptedUpload.attachment,
                });
                setAnswers((current) => ({
                  ...current,
                  [field.id]: getUploadAnswer(current[field.id]).map((item) =>
                    item.id === attachment.id
                      ? { ...item, status: "uploaded", progress: 100, walrusBlobId: upload.blobId }
                      : item,
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
        metadata: {
          context: signalContext,
        },
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
      clearDraft();
      setFailure(null);
      setSubmitPipeline({ stage: "signal_secured", status: "complete", message: "Signal secured." });
    } catch (error) {
      if (isWalrusRuntimePreparingError(error)) {
        console.warn("[public submission] Walrus runtime was not ready for submission.", {
          error,
          walrusRuntime: getWalrusMutationRuntimeStatus(),
          formId: form.id,
          walletRequired,
          attachWallet,
          accountAddress,
        });
      }
      const message = getUserFacingSubmissionError(error, submitFailedLabel);
      setSubmitError(message);
      failPipeline(message);
      persistDraft(answers);
      setFailure(
        createCriticalFailure({
          error: new Error(message),
          surface:
            message.toLowerCase().includes("encrypt") || message.toLowerCase().includes("seal")
              ? "seal"
              : message.toLowerCase().includes("wallet")
                ? "wallet"
                : "walrus",
          step: submitPipeline.stage,
          diagnostics: {
            formId: form.id,
            manifestBlobId,
            walletRequired,
            attachWallet,
            walrusRuntime: getWalrusMutationRuntimeStatus(),
            rawError: getDiagnosticErrorMessage(error),
          },
        }),
      );
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
    failure,
    diagnosticsCopied,
    hasRecoverableDraft,
    submitPipeline,
    storageConnectionPreparing:
      Boolean(accountAddress && (walletRequired || attachWallet)) &&
      walrusRuntime.storageMode === "uploadRelay" &&
      walrusRuntime.writeConfigured &&
      (!walrusRuntime.hasClient || !walrusRuntime.hasWallet),
    visibleFieldIds,
    updateAnswer,
    handleSubmit,
    restoreDraft,
    discardDraft,
    copyDiagnostics,
  };
}
