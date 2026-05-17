import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  createEncryptedAttachmentUpload,
  createInlinePrivateAttachment,
  ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES,
  getStorageRuntimeStatus,
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
import { isQuotaExceededError, isRateLimitError } from "../../../storage/walrusDiagnostics";
import type { FormSchema, Submission, SubmissionAttachment } from "../../../types";
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../../../utils/formLogic";
import type { PublicAnswers, ValidationErrors } from "../types";

const REAL_SEAL_PROJECT_REQUIRED_MESSAGE =
  "Real Seal encrypted submissions require a project or form owner wallet. Connect the creator wallet or turn off Encrypt submissions.";
const STORAGE_CONNECTION_PREPARING_MESSAGE =
  "Storage connection is still preparing. Please wait a moment and try again.";
const RECOVERY_CORRUPTED_MESSAGE = "Stored recovery data could not be restored.";
const MAX_RECOVERY_RETRIES = 3;
const PENDING_ENCRYPTED_PAYLOADS_KEY = "deepsignal.encryptedPayloads";
const PENDING_FILES_KEY = "deepsignal.files";

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

function createRecoveryRetryStorageKey(formId: string, manifestBlobId: string) {
  return `deepsignal:public-recovery-retries:${formId}:${manifestBlobId || "direct"}`;
}

function createCorruptedRecoveryStorageKey(formId: string, manifestBlobId: string) {
  return `deepsignal:public-recovery-corrupted:${formId}:${manifestBlobId || "direct"}`;
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

function getAttachmentBlobIds(answers: PublicAnswers, attachmentFields: Set<string>) {
  return Object.entries(answers).flatMap(([fieldId, value]) =>
    attachmentFields.has(fieldId)
      ? getUploadAnswer(value).map((attachment) => attachment.walrusBlobId).filter((blobId): blobId is string => Boolean(blobId))
      : [],
  );
}

function getApproxPayloadSize(value: unknown) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
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

function getAttachmentTypeFromMime(mimeType: string): SubmissionAttachment["type"] {
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  return "document";
}

function canUseInlineEncryptedAttachment(form: FormSchema, fieldId: string) {
  return Boolean(form.encryptSubmissions && form.fields.some((field) => field.id === fieldId));
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

function getStoredRecoveryRetryCount(key: string) {
  if (!key) {
    return 0;
  }
  try {
    return Math.max(0, Number(window.localStorage.getItem(key) ?? "0") || 0);
  } catch {
    return 0;
  }
}

function classifyRecoveryStorageError(error: unknown, message: string) {
  const diagnosticMessage = getDiagnosticErrorMessage(error);
  const lower = `${message} ${diagnosticMessage}`.toLowerCase();
  if (isQuotaExceededError(error) || lower.includes("quota")) {
    return {
      category: "quota_exceeded",
      guidance:
        "The storage quota has been exceeded. Free up browser storage or Walrus capacity, then discard this recovery before starting again.",
    };
  }
  if (isRateLimitError(error)) {
    return {
      category: "rate_limited",
      guidance: "The storage service is rate limiting requests. Wait a few minutes before trying again.",
    };
  }
  if (
    lower.includes("walrus") ||
    lower.includes("storage") ||
    lower.includes("upload") ||
    lower.includes("blob")
  ) {
    return {
      category: "storage_unavailable",
      guidance: "The storage service could not accept the recovery upload. Check connectivity and storage configuration.",
    };
  }
  return null;
}

function buildRecoveryDiagnostics({
  formId,
  manifestBlobId,
  answers,
  attachmentFields,
  error,
}: {
  formId?: string;
  manifestBlobId: string;
  answers: PublicAnswers;
  attachmentFields: Set<string>;
  error?: unknown;
}) {
  const attachmentBlobIds = getAttachmentBlobIds(answers, attachmentFields);
  const rawError = error ? getDiagnosticErrorMessage(error) : undefined;
  return {
    formId,
    manifestBlobId,
    storageBackend: getStorageRuntimeStatus(),
    payloadSizeBytes: getApproxPayloadSize(sanitizeDraftAnswers(answers, attachmentFields)),
    attachmentCount: attachmentBlobIds.length,
    attachmentBlobIds,
    browser: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    quotaExceptionName: error instanceof Error ? error.name : undefined,
    quotaExceptionMessage: rawError,
    quotaRelated: error ? isQuotaExceededError(error) : undefined,
  };
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
  const [recoveryGuidance, setRecoveryGuidance] = useState("");
  const [recoveryCorrupted, setRecoveryCorrupted] = useState(false);
  const [walrusRuntime, setWalrusRuntime] = useState(() => getWalrusMutationRuntimeStatus());
  const [submitPipeline, setSubmitPipeline] = useState<SignalPipelineState>({
    stage: "preparing_signal",
    status: "idle",
  });
  const activeAttachmentUploadsRef = useRef(new Set<string>());

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
    setRecoveryGuidance("");
    setRecoveryCorrupted(false);
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
  const recoveryRetryStorageKey = useMemo(
    () => (form ? createRecoveryRetryStorageKey(form.id, manifestBlobId) : ""),
    [form, manifestBlobId],
  );
  const corruptedRecoveryStorageKey = useMemo(
    () => (form ? createCorruptedRecoveryStorageKey(form.id, manifestBlobId) : ""),
    [form, manifestBlobId],
  );

  useEffect(() => {
    if (!draftStorageKey) {
      setHasRecoverableDraft(false);
      setRecoveryCorrupted(false);
      return;
    }
    try {
      const rawDraft = window.localStorage.getItem(draftStorageKey);
      const rawCorrupted = corruptedRecoveryStorageKey
        ? window.localStorage.getItem(corruptedRecoveryStorageKey)
        : null;
      const corrupted = Boolean(rawDraft && rawCorrupted);
      setRecoveryCorrupted(corrupted);
      setHasRecoverableDraft(Boolean(rawDraft) && !corrupted);
      if (corrupted) {
        const parsed = rawCorrupted ? JSON.parse(rawCorrupted) as { guidance?: string; category?: string; retries?: number } : {};
        setRecoveryGuidance(parsed.guidance ?? "");
        setSubmitError(parsed.guidance ?? "");
        setFailure(
          createCriticalFailure({
            error: new Error(RECOVERY_CORRUPTED_MESSAGE),
            surface: "walrus",
            step: "recovery",
            retryable: false,
            diagnostics: {
              formId: form?.id,
              manifestBlobId,
              recoveryCorrupted: true,
              recoveryCategory: parsed.category,
              recoveryRetries: parsed.retries,
            },
          }),
        );
      }
    } catch {
      setHasRecoverableDraft(false);
      setRecoveryCorrupted(false);
    }
  }, [corruptedRecoveryStorageKey, draftStorageKey, form?.id, manifestBlobId]);

  useEffect(() => {
    setErrors((current) => {
      const nextEntries = Object.entries(current).filter(([fieldId, message]) => visibleFieldIds.has(fieldId) || !message);
      return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries);
    });
  }, [visibleFieldIds]);

  function updateAnswer(fieldId: string, value: unknown) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => ({ ...current, [fieldId]: "" }));
    if (!recoveryCorrupted) {
      setFailure(null);
      setRecoveryGuidance("");
    }
    const field = form?.fields.find((item) => item.id === fieldId);
    if (!field || !attachmentFields.has(fieldId)) {
      return;
    }
    if (form?.encryptSubmissions) {
      return;
    }
    getUploadAnswer(value).forEach((attachment) => {
      if (attachment.status !== "pending" || !attachment.file || attachment.error) {
        return;
      }
      void uploadAttachmentImmediately(fieldId, field.label || "Attachment", Boolean(form?.encryptSubmissions || field.sensitive), attachment);
    });
  }

  function updateAttachment(fieldId: string, attachmentId: string, updater: (attachment: UploadDropzoneItem) => UploadDropzoneItem) {
    setAnswers((current) => ({
      ...current,
      [fieldId]: getUploadAnswer(current[fieldId]).map((attachment) =>
        attachment.id === attachmentId ? updater(attachment) : attachment,
      ),
    }));
  }

  async function uploadAttachmentImmediately(
    fieldId: string,
    fieldLabel: string,
    requiresProtectedAttachment: boolean,
    attachment: UploadDropzoneItem,
  ) {
    if (!attachment.file || activeAttachmentUploadsRef.current.has(attachment.id)) {
      return;
    }
    activeAttachmentUploadsRef.current.add(attachment.id);
    const progressTimer = createPseudoProgress((progress) => {
      updateAttachment(fieldId, attachment.id, (item) => ({
        ...item,
        progress,
        status: "uploading",
        error: undefined,
      }));
    });

    try {
      const uploadFile = requiresProtectedAttachment
        ? (await createEncryptedAttachmentUpload(attachment.file, activeSealAdapter, {
            projectId: form?.projectId,
            ownerAddress: form?.ownerAddress,
          })).file
        : attachment.file;
      const upload = await storageAdapter.uploadFile(uploadFile);
      if (isLocalFallbackBlob(upload.blobId)) {
        throw new Error("Attachment upload needs Walrus storage. Reconnect storage and select the file again.");
      }
      window.clearInterval(progressTimer);
      updateAttachment(fieldId, attachment.id, (item) => ({
        ...item,
        status: "uploaded",
        progress: 100,
        walrusBlobId: upload.blobId,
        error: undefined,
      }));
    } catch (error) {
      window.clearInterval(progressTimer);
      updateAttachment(fieldId, attachment.id, (item) => ({
        ...item,
        status: "failed",
        progress: 0,
        error: formatUploadFailure(fieldLabel, error),
      }));
    } finally {
      activeAttachmentUploadsRef.current.delete(attachment.id);
    }
  }

  function persistDraft(nextAnswers: PublicAnswers) {
    if (!draftStorageKey || !hasRecoverableAnswers(nextAnswers)) {
      return;
    }
    const payload: RecoverablePublicDraft = {
      answers: sanitizeDraftAnswers(nextAnswers, attachmentFields),
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      setHasRecoverableDraft(true);
    } catch {
      setHasRecoverableDraft(false);
    }
  }

  function clearDraft() {
    if (!draftStorageKey) {
      return;
    }
    window.localStorage.removeItem(draftStorageKey);
    setHasRecoverableDraft(false);
  }

  function clearRecoveryRetryState() {
    if (recoveryRetryStorageKey) {
      window.localStorage.removeItem(recoveryRetryStorageKey);
    }
    if (corruptedRecoveryStorageKey) {
      window.localStorage.removeItem(corruptedRecoveryStorageKey);
    }
    setRecoveryCorrupted(false);
    setRecoveryGuidance("");
  }

  function markRecoveryCorrupted(details: { category?: string; guidance?: string; retries: number; rawError?: string }) {
    if (corruptedRecoveryStorageKey) {
      try {
        window.localStorage.setItem(
          corruptedRecoveryStorageKey,
          JSON.stringify({
            ...details,
            corruptedAt: new Date().toISOString(),
          }),
        );
      } catch {
        // The in-memory corrupted state still stops retries when local storage is full.
      }
    }
    setRecoveryCorrupted(true);
    setRecoveryGuidance(details.guidance ?? "");
    setHasRecoverableDraft(false);
  }

  function recordRecoveryFailure(error: unknown, message: string) {
    const classification = classifyRecoveryStorageError(error, message);
    if (!classification || !recoveryRetryStorageKey) {
      return { corrupted: false, retries: 0, classification };
    }
    const retries = getStoredRecoveryRetryCount(recoveryRetryStorageKey) + 1;
    try {
      window.localStorage.setItem(recoveryRetryStorageKey, String(retries));
    } catch {
      // Keep going; quota failures are still represented in the visible failure state.
    }
    const corrupted = retries >= MAX_RECOVERY_RETRIES;
    if (corrupted) {
      markRecoveryCorrupted({
        category: classification.category,
        guidance: classification.guidance,
        retries,
        rawError: getDiagnosticErrorMessage(error),
      });
    } else {
      setRecoveryGuidance(classification.guidance);
    }
    return { corrupted, retries, classification };
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
      clearRecoveryRetryState();
      setHasRecoverableDraft(false);
    } catch (error) {
      const retries = getStoredRecoveryRetryCount(recoveryRetryStorageKey) + 1;
      markRecoveryCorrupted({
        category: "storage_unavailable",
        guidance: RECOVERY_CORRUPTED_MESSAGE,
        retries,
        rawError: getDiagnosticErrorMessage(error),
      });
      setFailure(
        createCriticalFailure({
          error: new Error(RECOVERY_CORRUPTED_MESSAGE),
          surface: "walrus",
          step: "recovery",
          retryable: false,
          diagnostics: buildRecoveryDiagnostics({
            formId: form?.id,
            manifestBlobId,
            answers,
            attachmentFields,
            error,
          }),
        }),
      );
    }
  }

  function discardDraft() {
    clearDraft();
  }

  function discardRecovery() {
    clearDraft();
    clearRecoveryRetryState();
    try {
      window.localStorage.removeItem(PENDING_ENCRYPTED_PAYLOADS_KEY);
      window.localStorage.removeItem(PENDING_FILES_KEY);
    } catch {
      // Best-effort cleanup; the UI state reset below still gives the responder a clean page.
    }
    setAnswers(initialAnswers);
    setErrors({});
    setSubmitted(null);
    setSubmitError("");
    setSubmitNotice("");
    setFailure(null);
    setDiagnosticsCopied(false);
    setSubmitPipeline({ stage: "preparing_signal", status: "idle" });
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
      const usesInlineEncryptedAttachments = canUseInlineEncryptedAttachment(currentForm, field.id);
      if (
        attachmentFields.has(field.id) &&
        !usesInlineEncryptedAttachments &&
        uploadItems.some((attachment) => attachment.status === "pending" || attachment.status === "uploading")
      ) {
        nextErrors[field.id] = "Attachment upload is still in progress. Wait for the Walrus blob ID before sending.";
        return;
      }
      if (attachmentFields.has(field.id) && uploadItems.some((attachment) => attachment.status === "failed")) {
        nextErrors[field.id] = "Attachment upload failed. Remove the failed file or select it again.";
        return;
      }
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
          (usesInlineEncryptedAttachments
            ? uploadItems.filter((attachment) => attachment.status !== "failed" && (attachment.file || attachment.walrusBlobId)).length === 0
            : uploadItems.filter((attachment) => attachment.status === "uploaded" && attachment.walrusBlobId).length === 0));
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
    if (recoveryCorrupted) {
      setSubmitError(recoveryGuidance);
      setFailure(
        createCriticalFailure({
          error: new Error(RECOVERY_CORRUPTED_MESSAGE),
          surface: "walrus",
          step: "recovery",
          retryable: false,
          diagnostics: {
            formId: form.id,
            manifestBlobId,
            recoveryCorrupted: true,
          },
        }),
      );
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
          const fieldUploads = getUploadAnswer(value);
          const validUploads = fieldUploads.filter((attachment) => attachment.status === "uploaded" && attachment.walrusBlobId);
          const inlineUploads = fieldUploads.filter(
            (attachment) => attachment.status !== "failed" && (attachment.file || attachment.walrusBlobId),
          );

          if ((form.encryptSubmissions ? inlineUploads : validUploads).length === 0) {
            plainAnswers[field.id] = "";
            continue;
          }

          if (form.encryptSubmissions) {
            for (const attachment of inlineUploads) {
              if (attachment.walrusBlobId) {
                attachments.push({
                  fieldId: field.id,
                  type: getAttachmentTypeFromMime(attachment.mimeType || "application/octet-stream"),
                  blobId: attachment.walrusBlobId,
                  name: attachment.fileName,
                  size: attachment.fileSize,
                  storage: "blob",
                  encrypted: true,
                  originalName: attachment.fileName,
                  originalType: attachment.mimeType || "application/octet-stream",
                  encoding: "seal-base64-v1",
                });
                continue;
              }
              if (!attachment.file) {
                continue;
              }
              if (attachment.file.size > ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES) {
                throw new Error(attachmentTooLargeLabel(field.label || "Attachment", ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES));
              }
              const inlineAttachment = await createInlinePrivateAttachment(
                attachment.file,
                ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES,
              );
              attachments.push({
                ...inlineAttachment,
                fieldId: field.id,
              });
            }
            plainAnswers[field.id] = fieldUploads
              .filter((attachment) => attachment.status !== "failed")
              .map((attachment) => attachment.fileName)
              .join(", ");
          } else {
            for (const attachment of validUploads) {
              if (!attachment.walrusBlobId) {
                continue;
              }
              const requiresProtectedAttachment = field.sensitive;
              attachments.push({
                fieldId: field.id,
                type: getAttachmentTypeFromMime(attachment.mimeType || "application/octet-stream"),
                blobId: attachment.walrusBlobId,
                name: attachment.fileName,
                size: attachment.fileSize,
                storage: "blob",
                encrypted: requiresProtectedAttachment ? true : undefined,
                originalName: attachment.fileName,
                originalType: attachment.mimeType || "application/octet-stream",
                encoding: requiresProtectedAttachment ? "seal-base64-v1" : undefined,
              });
            }
            plainAnswers[field.id] = validUploads.map((attachment) => attachment.fileName).join(", ");
          }
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
        encryptedPayload: undefined,
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
      clearRecoveryRetryState();
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
      const recoveryFailure = recordRecoveryFailure(error, message);
      const displayMessage = recoveryFailure.corrupted ? RECOVERY_CORRUPTED_MESSAGE : message;
      const retryable =
        recoveryFailure.corrupted || recoveryFailure.classification?.category === "quota_exceeded"
          ? false
          : undefined;
      setSubmitError(message);
      failPipeline(displayMessage);
      if (!recoveryFailure.corrupted) {
        persistDraft(answers);
      }
      setFailure(
        createCriticalFailure({
          error: new Error(displayMessage),
          surface:
            message.toLowerCase().includes("encrypt") || message.toLowerCase().includes("seal")
              ? "seal"
              : message.toLowerCase().includes("wallet")
                ? "wallet"
                : "walrus",
          step: submitPipeline.stage,
          retryable,
          diagnostics: {
            walletRequired,
            attachWallet,
            walrusRuntime: getWalrusMutationRuntimeStatus(),
            rawError: getDiagnosticErrorMessage(error),
            ...buildRecoveryDiagnostics({
              formId: form.id,
              manifestBlobId,
              answers,
              attachmentFields,
              error,
            }),
            recoveryCategory: recoveryFailure.classification?.category,
            recoveryRetries: recoveryFailure.retries,
            recoveryRetryLimit: MAX_RECOVERY_RETRIES,
            recoveryCorrupted: recoveryFailure.corrupted,
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
    recoveryGuidance,
    recoveryCorrupted,
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
    discardRecovery,
    copyDiagnostics,
  };
}
