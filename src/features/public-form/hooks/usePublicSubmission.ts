import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { UploadDropzoneItem } from "../../../components/UploadDropzone";
import {
  buildCriticalFailureDiagnostics,
  createCriticalFailure,
  type CriticalFailure,
} from "../../../lib/criticalFailure";
import { isAttachmentFieldType } from "../../../lib/fieldTypes";
import { normalizeValidSuiAddress } from "../../../lib/suiAddress";
import { getSubmissionCategoryFromPurpose } from "../../../lib/formTemplates";
import { isResponseDeadlinePassed } from "../../../lib/responseDeadline";
import { ensureRespondentSession } from "../../../lib/respondentSession";
import { collectSignalContext, installSignalContextCapture } from "../../../lib/signalContext";
import { ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES } from "../../../lib/attachmentLimits";
import { makeId } from "../../../lib/utils";
import { scheduleIdleTask } from "../../../lib/scheduleIdleTask";
import type { ZkLoginSession } from "../../../lib/zkloginSession";
import { useRpcInfrastructure } from "../../../rpcInfrastructure";
import { isQuotaExceededError, isRateLimitError } from "../../../storage/walrusDiagnostics";
import type { FormSchema, Submission, SubmissionAttachment, SubmissionLocation } from "../../../types";
import { getOrderedFields, getVisibleFieldIds } from "../../../utils/formLogic";
import type { PublicAnswers, PublicVoiceAnswerDraft, ValidationErrors } from "../types";
import { getUploadAnswer } from "../utils/getUploadAnswer";
import { validatePublicSubmission, validateSubmissionLocation } from "../utils/validatePublicSubmission";

const REAL_SEAL_PROJECT_REQUIRED_MESSAGE =
  "Real Seal encrypted submissions require a project or form owner wallet. Connect the creator wallet or turn off Encrypt submissions.";
const STORAGE_PREPARING_MESSAGE = "Storage is preparing. Please wait a few seconds.";
const RECOVERY_CORRUPTED_MESSAGE = "Stored recovery data could not be restored.";
const MAX_RECOVERY_RETRIES = 3;
const PENDING_ENCRYPTED_PAYLOADS_KEY = "deepsignal.encryptedPayloads";
const PENDING_FILES_KEY = "deepsignal.files";

type StorageRuntimeStatus = {
  mode: "walrus" | "local-fallback";
  notice: string | null;
  diagnostics: unknown;
};

type WalrusRuntimeStatus = {
  aggregatorConfigured: boolean;
  writeConfigured: boolean;
  hasClient: boolean;
  hasWallet: boolean;
  canWrite: boolean;
  storageMode: string;
};

export type SubmissionLocationCaptureState =
  | "idle"
  | "requesting"
  | "success"
  | "error"
  | "denied"
  | "unsupported";

const DEFAULT_STORAGE_RUNTIME_STATUS: StorageRuntimeStatus = {
  mode: "local-fallback",
  notice: null,
  diagnostics: null,
};

const DEFAULT_WALRUS_RUNTIME_STATUS: WalrusRuntimeStatus = {
  aggregatorConfigured: false,
  writeConfigured: false,
  hasClient: false,
  hasWallet: false,
  canWrite: false,
  storageMode: "uploadRelay",
};

function isLocalFallbackBlob(blobId?: string | null) {
  return Boolean(blobId && blobId.startsWith("local-"));
}

function getMyResponseStorageMode({
  runtimeMode,
  walrusStorageMode,
  blobId,
}: {
  runtimeMode: "walrus" | "local-fallback";
  walrusStorageMode: string;
  blobId?: string | null;
}) {
  if (runtimeMode === "local-fallback" || isLocalFallbackBlob(blobId)) {
    return "local" as const;
  }
  return walrusStorageMode === "uploadRelay" ? "uploadRelay" as const : "walrus" as const;
}

export const SIGNAL_PIPELINE_STAGES = [
  "idle",
  "preparing",
  "local_preserved",
  "walrus_uploading",
  "inbox_syncing",
  "completed",
] as const;

export type SignalPipelineStage = (typeof SIGNAL_PIPELINE_STAGES)[number];
export type SignalPipelineStatus = "idle" | "active" | "pending" | "failed" | "complete";
export type SignalFailureState = "upload_failed" | "sync_failed" | "offline_preserved" | null;

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
    Object.entries(answers).map(([fieldId, value]) => {
      if (attachmentFields.has(fieldId)) {
        return [fieldId, []];
      }
      if (isVoiceAnswerDraft(value)) {
        return [
          fieldId,
          {
            ...value,
            audioUrl: undefined,
            blob: undefined,
          },
        ];
      }
      return [fieldId, value];
    }),
  ) satisfies PublicAnswers;
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

function getAttachmentTypeFromMime(mimeType: string): SubmissionAttachment["type"] {
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  return "document";
}

function isVoiceAnswerDraft(value: unknown): value is PublicVoiceAnswerDraft {
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

function buildVoiceFileName(fieldId: string, mimeType: string) {
  const subtype = (mimeType.split("/")[1] || "webm").split(";")[0];
  return `${fieldId}-voice.${subtype}`;
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
    return STORAGE_PREPARING_MESSAGE;
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
  storageBackend,
}: {
  formId?: string;
  manifestBlobId: string;
  answers: PublicAnswers;
  attachmentFields: Set<string>;
  error?: unknown;
  storageBackend: StorageRuntimeStatus;
}) {
  const attachmentBlobIds = getAttachmentBlobIds(answers, attachmentFields);
  const rawError = error ? getDiagnosticErrorMessage(error) : undefined;
  return {
    formId,
    manifestBlobId,
    storageBackend,
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
  identityMode: "anonymous" | "wallet" | "zklogin";
  zkLoginSession?: ZkLoginSession | null;
  manifestBlobId: string;
  requiredFieldError: string;
  responseDeadlinePassedLabel: string;
  localFallbackNotice: string;
  suiRegistrationDeferredNotice: string;
  submitFailedLabel: string;
  attachmentTooLargeLabel: (fieldLabel: string, maxSizeBytes: number) => string;
  requiredLocationError: string;
  locationPromptLabel: string;
  locationDeniedLabel: string;
  locationUnavailableLabel: string;
  locationFailedLabel: string;
  zkLoginSessionExpiredLabel: string;
  zkLoginProviderLabel: string;
}

export function usePublicSubmission({
  form,
  initialAnswers,
  accountAddress,
  walletProvider,
  attachWallet,
  walletRequired,
  identityMode,
  zkLoginSession,
  manifestBlobId,
  requiredFieldError,
  responseDeadlinePassedLabel,
  localFallbackNotice,
  suiRegistrationDeferredNotice,
  submitFailedLabel,
  attachmentTooLargeLabel,
  requiredLocationError,
  locationPromptLabel,
  locationDeniedLabel,
  locationUnavailableLabel,
  locationFailedLabel,
  zkLoginSessionExpiredLabel,
  zkLoginProviderLabel,
}: UsePublicSubmissionArgs) {
  const rpcInfrastructure = useRpcInfrastructure();
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
  const [storageRuntime, setStorageRuntime] = useState<StorageRuntimeStatus>(DEFAULT_STORAGE_RUNTIME_STATUS);
  const [walrusRuntime, setWalrusRuntime] = useState<WalrusRuntimeStatus>(DEFAULT_WALRUS_RUNTIME_STATUS);
  const [walrusRuntimeReady, setWalrusRuntimeReady] = useState(false);
  const [submitPipeline, setSubmitPipeline] = useState<SignalPipelineState>({
    stage: "idle",
    status: "idle",
  });
  const [signalFailureState, setSignalFailureState] = useState<SignalFailureState>(null);
  const [location, setLocation] = useState<SubmissionLocation | undefined>();
  const [locationState, setLocationState] = useState<SubmissionLocationCaptureState>("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const activeAttachmentUploadsRef = useRef(new Set<string>());
  const lastFormResetKeyRef = useRef<string | null>(null);
  const effectiveIdentityMode =
    identityMode === "wallet" && !accountAddress && !walletRequired ? "anonymous" : identityMode;
  const walletReady = effectiveIdentityMode !== "wallet" || Boolean(accountAddress);
  const walrusClientReady = walrusRuntime.hasClient;
  const uploadRelayReady = walrusRuntime.storageMode === "uploadRelay" && walrusRuntime.writeConfigured;
  const canAnonymousUpload = effectiveIdentityMode === "anonymous" && uploadRelayReady;
  const canWrite = uploadRelayReady || (walletReady && walrusClientReady);
  const storageConnectionPreparing =
    walrusRuntimeReady && effectiveIdentityMode === "anonymous" && walrusRuntime.storageMode === "uploadRelay"
      ? !uploadRelayReady
      : walrusRuntimeReady &&
          effectiveIdentityMode === "wallet" &&
          walletReady &&
          !canWrite;

  useEffect(() => installSignalContextCapture(), []);

  useEffect(() => {
    if (!canWrite) {
      return;
    }
    void import("../../../storage/storageFactory")
      .then(({ retryPendingSubmissionSync }) => retryPendingSubmissionSync({ allowWalletPrompt: false }))
      .catch((error) => {
        console.warn("[public submission] pending remote sync retry failed to start", error);
      });
  }, [canWrite]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const cancelIdleTask = scheduleIdleTask(() => {
      void import("../../../lib/walrus").then(({ getWalrusMutationRuntimeStatus, subscribeWalrusRuntime }) => {
        if (cancelled || typeof window === "undefined") {
          return;
        }
        setWalrusRuntime(getWalrusMutationRuntimeStatus());
        setWalrusRuntimeReady(true);
        unsubscribe = subscribeWalrusRuntime(() => {
          if (!cancelled && typeof window !== "undefined") {
            setWalrusRuntime(getWalrusMutationRuntimeStatus());
            setWalrusRuntimeReady(true);
          }
        });
      });
    }, 1800);

    return () => {
      cancelled = true;
      cancelIdleTask();
      unsubscribe?.();
    };
  }, []);

  const formResetKey = form ? `${form.id}:${manifestBlobId || "direct"}` : "no-form";

  useEffect(() => {
    if (lastFormResetKeyRef.current === formResetKey) {
      return;
    }
    lastFormResetKeyRef.current = formResetKey;
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
    setSubmitPipeline({ stage: "idle", status: "idle" });
    setSignalFailureState(null);
    setLocation(undefined);
    setLocationState("idle");
    setLocationMessage("");
  }, [formResetKey, initialAnswers]);

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

  const locationRequested = form?.locationRequirement === "required" || form?.locationRequirement === "optional";
  const isGeolocationSupported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    "geolocation" in navigator;

  async function requestLocation() {
    if (!locationRequested) {
      return true;
    }
    if (!isGeolocationSupported) {
      setLocation(undefined);
      setLocationState("unsupported");
      setLocationMessage(locationUnavailableLabel);
      return false;
    }
    setLocationState("requesting");
    setLocationMessage(locationPromptLabel);
    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextLocation: SubmissionLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date().toISOString(),
            source: "browser_geolocation",
          };
          setLocation(nextLocation);
          setLocationState("success");
          setLocationMessage("");
          setSubmitError("");
          resolve(true);
        },
        (error) => {
          setLocation(undefined);
          if (error.code === error.PERMISSION_DENIED) {
            setLocationState("denied");
            setLocationMessage(locationDeniedLabel);
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setLocationState("error");
            setLocationMessage(locationFailedLabel);
          } else if (error.code === error.TIMEOUT) {
            setLocationState("error");
            setLocationMessage(locationFailedLabel);
          } else {
            setLocationState("error");
            setLocationMessage(locationFailedLabel);
          }
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        },
      );
    });
  }

  function clearLocation() {
    setLocation(undefined);
    setLocationState("idle");
    setLocationMessage("");
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
      const {
        createEncryptedAttachmentUpload,
        getStorageRuntimeStatus,
        storageAdapter,
      } = await import("../../../lib/storage");
      if (identityMode === "wallet" && accountAddress) {
        const { waitForWalrusMutationRuntimeReady } = await import("../../../lib/walrus");
        await waitForWalrusMutationRuntimeReady({
          requireWallet: true,
          timeoutMs: 7000,
          expectedRpcUrl: rpcInfrastructure.currentRpcUrl,
          expectedNetwork: rpcInfrastructure.network,
        });
      }
      const { activeSealAdapter } = await import("../../../lib/seal");
      setStorageRuntime(getStorageRuntimeStatus());
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
        walrusProof: upload.walrusProof,
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
            storageBackend: storageRuntime,
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
    setSubmitPipeline({ stage: "idle", status: "idle" });
    setSignalFailureState(null);
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
    const nextErrors = validatePublicSubmission({
      form: currentForm,
      answers,
      visibleFieldIds,
      attachmentFields,
      requiredFieldError,
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
    const locationError = validateSubmissionLocation(currentForm, location, requiredLocationError);
    if (locationError) {
      setSubmitError(locationError);
      return false;
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

  function pendingPipeline(message: string) {
    setSubmitPipeline({
      stage: "inbox_syncing",
      status: "pending",
      message,
    });
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
    const sealRuntime = form.encryptSubmissions
      ? await import("../../../crypto/cryptoFactory").then(({ getSealRuntimeStatus }) => getSealRuntimeStatus())
      : null;
    if (sealRuntime && !sealRuntime.canEncrypt) {
      const message = sealRuntime.warning ?? "Seal encryption is unavailable. Submission was not uploaded.";
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
      sealRuntime &&
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
    if (effectiveIdentityMode === "wallet" && !accountAddress) {
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
    if (
      walrusRuntimeReady &&
      effectiveIdentityMode === "anonymous" &&
      walrusRuntime.storageMode === "uploadRelay" &&
      !canAnonymousUpload
    ) {
      setSubmitError(STORAGE_PREPARING_MESSAGE);
      setSubmitNotice("");
      setFailure(
        createCriticalFailure({
          error: new Error(STORAGE_PREPARING_MESSAGE),
          surface: "walrus",
          step: "validation",
          noDataSubmitted: true,
          diagnostics: {
            formId: form.id,
            identityMode: effectiveIdentityMode,
            walletReady,
            walrusClientReady,
            uploadRelayReady,
            canAnonymousUpload,
            canWrite,
            walrusRuntime,
          },
        }),
      );
      return;
    }
    if (effectiveIdentityMode === "zklogin" && !zkLoginSession) {
      setSubmitError(zkLoginSessionExpiredLabel);
      setSubmitNotice("");
      setFailure(
        createCriticalFailure({
          error: new Error(zkLoginSessionExpiredLabel),
          surface: "wallet",
          step: "validation",
          noDataSubmitted: true,
          diagnostics: { formId: form.id, identityMode },
        }),
      );
      return;
    }
    if (form.locationRequirement === "required" && !location) {
      const attached = await requestLocation();
      if (!attached) {
        setSubmitError(requiredLocationError);
        setSubmitNotice("");
        return;
      }
    }
    if (!validate(form)) {
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setSubmitNotice("");
    setFailure(null);
    setDiagnosticsCopied(false);
    setSignalFailureState(null);
    activatePipeline("preparing", "Preparing signal...");
    let historySubmission: Submission | null = null;
    const historyStartedAt = new Date().toISOString();
    try {
      if (effectiveIdentityMode === "wallet" && accountAddress) {
        const { waitForWalrusMutationRuntimeReady } = await import("../../../lib/walrus");
        await waitForWalrusMutationRuntimeReady({
          requireWallet: true,
          timeoutMs: 7000,
          expectedRpcUrl: rpcInfrastructure.currentRpcUrl,
          expectedNetwork: rpcInfrastructure.network,
        });
      }
      const {
        createInlinePrivateAttachment,
        getStorageRuntimeStatus,
        saveSubmissionWithEncryption,
        storageAdapter,
      } = await import("../../../lib/storage");
      const { saveSubmittedHistoryEntry } = await import("../../../storage/submittedHistory");
      const {
        buildMyResponseHistoryEntry,
        upsertMyResponseHistoryEntry,
      } = await import("../../../storage/myResponseHistory");
      setStorageRuntime(getStorageRuntimeStatus());
      const signedAt = historyStartedAt;
      const isAnonymous = effectiveIdentityMode === "anonymous";
      const session = await ensureRespondentSession({
        walletAddress: effectiveIdentityMode === "wallet" ? accountAddress : zkLoginSession?.address,
        isAnonymous,
      });
      const respondentMeta: Submission["respondentMeta"] = {
        walletAddress: effectiveIdentityMode === "wallet" && !isAnonymous ? accountAddress : undefined,
        chain: "sui" as const,
        sessionId: session.sessionId,
        submittedAt: signedAt,
        isAnonymous,
        identityKind: isAnonymous ? "anonymous" : effectiveIdentityMode === "zklogin" ? "zklogin" : "sui_wallet",
        identityProvider: effectiveIdentityMode === "zklogin" ? "google" : undefined,
        verifiedAddress:
          effectiveIdentityMode === "zklogin"
            ? zkLoginSession?.address
            : !isAnonymous
              ? accountAddress
              : undefined,
        zkLogin:
          effectiveIdentityMode === "zklogin" && zkLoginSession
            ? {
                iss: zkLoginSession.iss,
                aud: zkLoginSession.aud,
                address: zkLoginSession.address,
                legacyAddress: false,
                subHash: zkLoginSession.subHash,
              }
            : undefined,
      };
      const signalContext = collectSignalContext({
        form,
        manifestBlobId,
        walletAddress: effectiveIdentityMode === "wallet" ? accountAddress : zkLoginSession?.address,
        walletProvider:
          effectiveIdentityMode === "wallet" ? walletProvider : zkLoginSession ? zkLoginProviderLabel : undefined,
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
                  walrusProof: attachment.walrusProof,
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
                walrusProof: attachment.walrusProof,
              });
            }
            plainAnswers[field.id] = validUploads.map((attachment) => attachment.fileName).join(", ");
          }
        } else {
          if (field.type === "voice" && isVoiceAnswerDraft(value)) {
            if (!value.blob) {
              plainAnswers[field.id] = {
                kind: "voice",
                audioUrl: value.audioUrl,
                audioBlobId: value.audioBlobId,
                duration: value.duration,
                mimeType: value.mimeType,
                transcript: value.transcript,
                fileName: value.fileName,
                size: value.size,
              };
              continue;
            }

            const voiceFile = new File([value.blob], value.fileName || buildVoiceFileName(field.id, value.mimeType), {
              type: value.mimeType || "audio/webm",
              lastModified: Date.now(),
            });

            if (form.encryptSubmissions) {
              if (voiceFile.size > ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES) {
                throw new Error(attachmentTooLargeLabel(field.label || "Voice answer", ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES));
              }
              const inlineAttachment = await createInlinePrivateAttachment(voiceFile, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES);
              const audioBlobId = inlineAttachment.blobId;
              attachments.push({
                ...inlineAttachment,
                fieldId: field.id,
                type: "audio",
              });
              plainAnswers[field.id] = {
                kind: "voice",
                audioBlobId,
                duration: value.duration,
                mimeType: value.mimeType,
                transcript: value.transcript,
                fileName: value.fileName || voiceFile.name,
                size: value.size ?? voiceFile.size,
              };
              continue;
            }

            const uploadedVoice = await storageAdapter.uploadFile(voiceFile);
            attachments.push({
              fieldId: field.id,
              type: "audio",
              blobId: uploadedVoice.blobId,
              name: value.fileName || voiceFile.name,
              size: value.size ?? voiceFile.size,
              storage: "blob",
              originalName: value.fileName || voiceFile.name,
              originalType: value.mimeType,
              walrusProof: uploadedVoice.walrusProof,
              tatumStorage: uploadedVoice.tatumStorage,
            });
            plainAnswers[field.id] = {
              kind: "voice",
              audioBlobId: uploadedVoice.blobId,
              audioUrl: uploadedVoice.url,
              duration: value.duration,
              mimeType: value.mimeType,
              transcript: value.transcript,
              fileName: value.fileName || voiceFile.name,
              size: value.size ?? voiceFile.size,
            };
            continue;
          }
          plainAnswers[field.id] = value;
        }
      }

      const normalizedAnswers = Object.fromEntries(
        Object.entries(plainAnswers).map(([fieldId, value]) => {
          const field = form.fields.find((candidate) => candidate.id === fieldId);
          return [fieldId, field?.type === "walletAddress" ? normalizeValidSuiAddress(value) : value];
        }),
      );
      const publicPayloadAnswers = Object.fromEntries(
        visibleFields.filter((field) => !field.sensitive).map((field) => [field.id, normalizedAnswers[field.id]]),
      );
      const submission: Submission = {
        id: makeId("submission"),
        formId: form.id,
        formVersion: form.formVersion,
        formBlobId: form.blobId,
        schemaHash: form.schemaHash,
        manifestBlobId: form.manifestBlobId,
        projectId: form.projectId,
        answers: normalizedAnswers,
        attachments,
        location,
        publicPayload: form.encryptSubmissions
          ? undefined
          : {
              answers: publicPayloadAnswers,
              attachments,
            },
        respondentMeta,
        metadata: {
          context: signalContext,
          rpcProvider: rpcInfrastructure.providerLabel,
          rpcUrl: rpcInfrastructure.displayRpcUrl,
          network: rpcInfrastructure.connectedNetworkLabel,
          respondentIdentity: {
            mode: respondentMeta.identityKind,
            provider: respondentMeta.identityProvider,
            verifiedAddress: respondentMeta.verifiedAddress,
            zkLoginIssuer: respondentMeta.zkLogin?.iss,
          },
        },
        category: getSubmissionCategoryFromPurpose(form.purpose),
        status: "unread",
        priority: "medium",
        triageStatus: "new",
        tags: [],
        notes: "",
        contributorId: respondentMeta.verifiedAddress ?? respondentMeta.walletAddress ?? respondentMeta.sessionId,
        isEncrypted: Boolean(form.encryptSubmissions),
        pendingOnchainRegistration: Boolean(form.projectId),
        createdAt: signedAt,
        updatedAt: signedAt,
      };
      historySubmission = submission;
      upsertMyResponseHistoryEntry(
        buildMyResponseHistoryEntry({
          form,
          submission,
          status: "pending",
          storageMode: getMyResponseStorageMode({
            runtimeMode: getStorageRuntimeStatus().mode,
            walrusStorageMode: walrusRuntime.storageMode,
          }),
        }),
      );

      activatePipeline(
        "preparing",
        form.encryptSubmissions ? "Encrypting response..." : "Preparing secure upload...",
      );
      const { enqueuePendingSubmission } = await import("../../../storage/submissionDelivery");
      enqueuePendingSubmission({
        ...submission,
        remoteIndexUpdated: false,
        remoteIndexReadBack: false,
        ownerReadable: false,
        remoteSyncStatus: "local_only",
        deliveryStatus: "stored_local",
        deliveryStatuses: ["stored_local"],
      });
      const result = await saveSubmissionWithEncryption(form, submission, undefined, storageAdapter, {
        responseDeadlinePassed: responseDeadlinePassedLabel,
        onPipelineStage(stage) {
          activatePipeline(
            stage === "encrypting" ? "preparing" : "walrus_uploading",
            stage === "encrypting"
              ? "Encrypting response..."
              : "Storing securely...",
          );
        },
      });
      activatePipeline(
        isLocalFallbackBlob(result.blobId) ? "local_preserved" : "walrus_uploading",
        isLocalFallbackBlob(result.blobId) ? "Signal saved in local recovery." : "Verifying secure storage...",
      );
      await pausePipelineStep();
      activatePipeline(
        "inbox_syncing",
        isLocalFallbackBlob(result.blobId) ? "Preparing local recovery path..." : "Preparing recovery path...",
      );
      await pausePipelineStep();
      const savedSubmission = {
        ...submission,
        formVersion: result.formVersion ?? submission.formVersion,
        formBlobId: result.formBlobId ?? submission.formBlobId,
        schemaHash: result.schemaHash ?? submission.schemaHash,
        manifestBlobId: result.manifestBlobId ?? submission.manifestBlobId,
        isEncrypted: Boolean(form.encryptSubmissions),
        blobId: result.blobId,
        answerBlobId: result.answerBlobId ?? result.blobId,
        encryptedBlobId: "encryptedBlobId" in result ? result.encryptedBlobId : undefined,
        encryptedWalrusProof: "encryptedWalrusProof" in result ? result.encryptedWalrusProof : undefined,
        encryptedPayload: undefined,
        sealIdentity: "sealIdentity" in result ? result.sealIdentity : undefined,
        receiptBlobId: result.answerBlobId ?? result.blobId ?? undefined,
        remoteIndexBlobId: result.remoteIndexBlobId,
        remoteIndexTarget: result.remoteIndexTarget,
        remoteIndexUpdated: result.remoteIndexUpdated,
        remoteIndexReadBack: result.remoteIndexReadBack,
        ownerReadable: result.ownerReadable,
        remoteSyncStatus: result.remoteSyncStatus,
        deliveryStatus: isLocalFallbackBlob(result.answerBlobId ?? result.blobId)
          ? "stored_local"
          : result.remoteSyncStatus === "remote_synced" &&
              result.remoteIndexUpdated === true &&
              result.remoteIndexReadBack === true &&
              result.ownerReadable === true
            ? "inbox_synced"
            : "inbox_pending",
        deliveryStatuses: isLocalFallbackBlob(result.answerBlobId ?? result.blobId)
          ? ["stored_local"]
          : result.remoteSyncStatus === "remote_synced" &&
              result.remoteIndexUpdated === true &&
              result.remoteIndexReadBack === true &&
              result.ownerReadable === true
            ? ["stored_local", "stored_walrus", "inbox_synced"]
            : ["stored_local", "stored_walrus", "inbox_pending"],
        walrusProof: result.walrusProof,
      } satisfies Submission;
      const latestStorageRuntime = getStorageRuntimeStatus();
      setStorageRuntime(latestStorageRuntime);
      historySubmission = savedSubmission;
      const responseStorageMode = getMyResponseStorageMode({
        runtimeMode: latestStorageRuntime.mode,
        walrusStorageMode: walrusRuntime.storageMode,
        blobId: savedSubmission.answerBlobId ?? savedSubmission.blobId,
      });
      const remoteDelivered =
        result.remoteSyncStatus === "remote_synced" &&
        result.remoteIndexUpdated === true &&
        result.remoteIndexReadBack === true &&
        result.ownerReadable === true &&
        !isLocalFallbackBlob(result.answerBlobId ?? result.blobId);
      const walrusManifestBundleSaved =
        result.remoteIndexTarget === "walrus-manifest-bundle" &&
        result.remoteIndexUpdated === true &&
        !isLocalFallbackBlob(result.answerBlobId ?? result.blobId);
      const externalIndexAccepted =
        result.remoteIndexTarget === "google-apps-script-drive" &&
        result.remoteIndexUpdated === true &&
        !isLocalFallbackBlob(result.answerBlobId ?? result.blobId);
      const notices = [];
      if (manifestBlobId && isLocalFallbackBlob(savedSubmission.encryptedBlobId ?? savedSubmission.blobId)) {
        notices.push(localFallbackNotice);
      }
      if (!remoteDelivered && walrusManifestBundleSaved) {
        notices.push(
          "Signal evidence was saved to Walrus, but owner inbox delivery is pending because the submission relay is not configured.",
        );
      }
      if (!remoteDelivered && externalIndexAccepted) {
        notices.push(
          "Signal evidence was saved to Walrus and handed to the Google Drive relay; owner inbox confirmation is pending.",
        );
      }
      if (form.projectId) {
        notices.push(suiRegistrationDeferredNotice);
      }
      const walrusEvidenceExists = Boolean(
        !isLocalFallbackBlob(savedSubmission.answerBlobId ?? savedSubmission.blobId) &&
          (savedSubmission.answerBlobId || savedSubmission.blobId || savedSubmission.encryptedBlobId),
      );
      if (!remoteDelivered && !walrusEvidenceExists && !walrusManifestBundleSaved && !externalIndexAccepted) {
        const message =
          isLocalFallbackBlob(savedSubmission.encryptedBlobId ?? savedSubmission.blobId)
            ? "Signal preserved locally. Retry when storage is reachable to finish Walrus upload and inbox sync."
            : "Signal was saved as a pending delivery, but it is not yet readable from the owner inbox. Keep this page available until remote sync completes or retry from this device.";
        setSubmitted(null);
        setSubmitNotice(notices.join(" "));
        setSubmitError(message);
        setSignalFailureState(isLocalFallbackBlob(savedSubmission.encryptedBlobId ?? savedSubmission.blobId) ? "offline_preserved" : "sync_failed");
        upsertMyResponseHistoryEntry(
          buildMyResponseHistoryEntry({
            form,
            submission: savedSubmission,
            status: isLocalFallbackBlob(savedSubmission.encryptedBlobId ?? savedSubmission.blobId) ? "local-only" : "pending",
            storageMode: responseStorageMode,
            errorMessage: message,
          }),
        );
        failPipeline(message);
        setFailure(
          createCriticalFailure({
            error: new Error(message),
            surface: "walrus",
            step: isLocalFallbackBlob(savedSubmission.encryptedBlobId ?? savedSubmission.blobId)
              ? "uploading_to_walrus"
              : "generating_manifest",
            retryable: true,
            diagnostics: {
              formId: form.id,
              projectId: form.projectId,
              submissionId: submission.id,
              answerBlobId: savedSubmission.answerBlobId,
              remoteIndexBlobId: savedSubmission.remoteIndexBlobId,
              remoteIndexTarget: savedSubmission.remoteIndexTarget,
              remoteIndexUpdated: savedSubmission.remoteIndexUpdated,
              remoteIndexReadBack: savedSubmission.remoteIndexReadBack,
              ownerReadable: savedSubmission.ownerReadable,
              remoteSyncStatus: savedSubmission.remoteSyncStatus,
              localFallback: isLocalFallbackBlob(savedSubmission.encryptedBlobId ?? savedSubmission.blobId),
              storageMode: latestStorageRuntime.mode,
              walrusStorageMode: walrusRuntime.storageMode,
              walrusFailureNotice: latestStorageRuntime.notice,
              walrusFailureDiagnostics: latestStorageRuntime.diagnostics,
            },
          }),
        );
        return;
      }
      if (!remoteDelivered) {
        const message =
          "Your signal is safely stored. Inbox synchronization will retry automatically.";
        const pendingSubmission = {
          ...savedSubmission,
          deliveryStatus: "inbox_pending" as const,
          deliveryStatuses: ["stored_local" as const, "stored_walrus" as const, "inbox_pending" as const],
          remoteSyncStatus: savedSubmission.remoteSyncStatus ?? ("sync_pending" as const),
        };
        setSubmitted(pendingSubmission);
        setSubmitNotice([message, ...notices].join(" "));
        setSubmitError("");
        setSignalFailureState(null);
        upsertMyResponseHistoryEntry(
          buildMyResponseHistoryEntry({
            form,
            submission: pendingSubmission,
            status: "pending",
            storageMode: responseStorageMode,
          }),
        );
        saveSubmittedHistoryEntry({
          form,
          submission: pendingSubmission,
          storageMode: getStorageRuntimeStatus().mode,
          walletAddress: effectiveIdentityMode === "wallet" ? accountAddress : undefined,
        });
        clearDraft();
        clearRecoveryRetryState();
        setFailure(null);
        pendingPipeline(message);
        enqueuePendingSubmission(pendingSubmission);
        return;
      }
      const syncedSubmission = {
        ...savedSubmission,
        deliveryStatus: "inbox_synced" as const,
        deliveryStatuses: ["stored_local" as const, "stored_walrus" as const, "inbox_synced" as const],
      };
      setSubmitted(syncedSubmission);
      upsertMyResponseHistoryEntry(
        buildMyResponseHistoryEntry({
          form,
          submission: syncedSubmission,
          status: "submitted",
          storageMode: responseStorageMode,
        }),
      );
      saveSubmittedHistoryEntry({
        form,
        submission: syncedSubmission,
        storageMode: getStorageRuntimeStatus().mode,
        walletAddress: effectiveIdentityMode === "wallet" ? accountAddress : undefined,
      });
      setSubmitNotice(notices.join(" "));
      clearDraft();
      clearRecoveryRetryState();
      setFailure(null);
      setSubmitPipeline({ stage: "completed", status: "complete", message: "Signal sent." });
    } catch (error) {
      const {
        buildFailedMyResponseDraft,
        buildMyResponseHistoryEntry,
        upsertMyResponseHistoryEntry,
      } = await import("../../../storage/myResponseHistory");
      const latestWalrusRuntime = await import("../../../lib/walrus")
        .then(({ getWalrusMutationRuntimeStatus }) => getWalrusMutationRuntimeStatus())
        .catch(() => walrusRuntime);
      if (isWalrusRuntimePreparingError(error)) {
        console.warn("[public submission] Walrus runtime was not ready for submission.", {
          error,
          walrusRuntime: latestWalrusRuntime,
          formId: form.id,
          walletRequired,
          attachWallet,
          accountAddress,
          identityMode,
        });
      }
      const message = getUserFacingSubmissionError(error, submitFailedLabel);
      const failedStorageMode = getMyResponseStorageMode({
        runtimeMode: storageRuntime.mode,
        walrusStorageMode: latestWalrusRuntime.storageMode,
        blobId: historySubmission?.answerBlobId ?? historySubmission?.blobId,
      });
      if (historySubmission) {
        upsertMyResponseHistoryEntry(
          buildMyResponseHistoryEntry({
            form,
            submission: historySubmission,
            status: "failed",
            storageMode: failedStorageMode,
            errorMessage: message,
          }),
        );
      } else {
        upsertMyResponseHistoryEntry(
          buildFailedMyResponseDraft({
            form,
            submissionId: makeId("submission_failed"),
            answers,
            submittedAt: historyStartedAt,
            status: "failed",
            storageMode: failedStorageMode,
            errorMessage: message,
          }),
        );
      }
      const recoveryFailure = recordRecoveryFailure(error, message);
      const displayMessage = recoveryFailure.corrupted ? RECOVERY_CORRUPTED_MESSAGE : message;
      const retryable =
        recoveryFailure.corrupted || recoveryFailure.classification?.category === "quota_exceeded"
          ? false
          : undefined;
      setSubmitError(message);
      setSignalFailureState(message.toLowerCase().includes("upload") || message.toLowerCase().includes("walrus") ? "upload_failed" : "offline_preserved");
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
            walletReady,
            walrusClientReady,
            uploadRelayReady,
            canAnonymousUpload,
            canWrite,
            walrusRuntime: latestWalrusRuntime,
            identityMode,
            rawError: getDiagnosticErrorMessage(error),
            ...buildRecoveryDiagnostics({
              formId: form.id,
              manifestBlobId,
              answers,
              attachmentFields,
              error,
              storageBackend: storageRuntime,
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
    signalFailureState,
    location,
    locationState,
    locationMessage,
    storageConnectionPreparing,
    visibleFieldIds,
    updateAnswer,
    requestLocation,
    clearLocation,
    handleSubmit,
    restoreDraft,
    discardDraft,
    discardRecovery,
    copyDiagnostics,
  };
}
