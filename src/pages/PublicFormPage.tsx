import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { DynamicField } from "../components/DynamicField";
import { EmptyState } from "../components/EmptyState";
import { FormHeaderImage } from "../components/FormHeaderImage";
import { RichTextContent } from "../components/RichText";
import { CriticalFailurePanel } from "../components/CriticalFailurePanel";
import { RecoverableDraftBanner } from "../components/RecoverableDraftBanner";
import { LocalRecoveryCenter } from "../components/LocalRecoveryCenter";
import { PublicSignalMetaChip } from "../components/PublicSignalMeta";
import { SignalSubmissionPipeline } from "../features/public-form/components/SignalSubmissionPipeline";
import { usePublicFormLoader } from "../features/public-form/hooks/usePublicFormLoader";
import { usePublicNftGate } from "../features/public-form/hooks/usePublicNftGate";
import { usePublicSubmission, type SignalPipelineStage } from "../features/public-form/hooks/usePublicSubmission";
import { useI18n } from "../i18n";
import { isNftGatedForm, requiresWalletForFormAccess } from "../lib/formAccess";
import { resolveNftCollectionArt } from "../lib/nftCollectionArt";
import {
  formatResponseDeadline,
  isResponseWindowClosed,
  isResponseWindowPending,
  type ResponseDeadlineLabels,
} from "../lib/responseDeadline";
import { DEFAULT_ATTACHMENT_MAX_BYTES, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES } from "../lib/attachmentLimits";
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../utils/formLogic";
import { isAttachmentFieldType, isConfirmationCheckboxField } from "../lib/fieldTypes";
import { collectSignalContext, type AttachedSignalContext } from "../lib/signalContext";
import { isZkLoginEnabled } from "../lib/zkloginOAuth";
import { loadZkLoginSession } from "../lib/zkloginSession";
import type { FieldType } from "../types";
import { retryLazyImport } from "../lib/lazyRetry";
import "../styles/components/forms-content.css";
import "../styles/components/metadata-proof.css";
import "../styles/pages/public-flows.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/public-form.css";
import "../styles/mobile/beacon.css";
import "../styles/mobile/intent.css";

const LazyPublicWalletAccountPanel = lazy(() =>
  retryLazyImport(() => import("../features/public-form/components/PublicWalletAccountPanel"), "public-wallet-account").then(
    (module) => ({ default: module.PublicWalletAccountPanel }),
  ),
);
const LazyPublicFormSuccess = lazy(() =>
  retryLazyImport(() => import("../features/public-form/components/PublicFormSuccess"), "public-form-success").then(
    (module) => ({ default: module.PublicFormSuccess }),
  ),
);
const LazyWalletSurface = lazy(() =>
  retryLazyImport(() => import("../components/WalletSurface"), "public-wallet-surface").then((module) => ({
    default: module.WalletSurface,
  })),
);
const SUCCESS_MASCOT_PRELOAD_ID = "deepsignal-success-mascot-preload";
const SUCCESS_MASCOT_WEBP_SRCSET = "/mascot-sealed.webp 1x, /mascot-sealed@2x.webp 2x";

function preloadSuccessMascot() {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(SUCCESS_MASCOT_PRELOAD_ID)) {
    return;
  }
  const link = document.createElement("link");
  link.id = SUCCESS_MASCOT_PRELOAD_ID;
  link.rel = "preload";
  link.as = "image";
  link.href = "/mascot-sealed.webp";
  link.type = "image/webp";
  link.setAttribute("imagesrcset", SUCCESS_MASCOT_WEBP_SRCSET);
  document.head.appendChild(link);
}

function PublicFormSuccessFallback({
  signalReceivedLabel,
  headline,
  savedCopy,
  retryCopy,
}: {
  signalReceivedLabel: string;
  headline: string;
  savedCopy: string;
  retryCopy: string;
}) {
  return (
    <section className="stack">
      <section className="panel glow-panel success-screen signal-success-scene">
        <div className="signal-success-hero signal-success-hero-fallback">
          <div className="signal-success-copy">
            <p className="eyebrow">{signalReceivedLabel}</p>
            <h1>{headline}</h1>
            <p className="lede">
              {savedCopy}
              <br />
              {retryCopy}
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}

function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  navigator.vibrate(pattern);
}

function hasPublicAnswerValue(field: { type: string; rows?: string[] }, value: unknown) {
  const fieldType = field.type as FieldType;
  if (isConfirmationCheckboxField(fieldType)) {
    return value === true;
  }
  if (field.type === "matrix") {
    const answer = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const rows = (field.rows ?? []).map((row) => row.trim()).filter(Boolean);
    return rows.length > 0 && rows.every((row) => Boolean(answer[row]));
  }
  if (isAttachmentFieldType(fieldType)) {
    return Array.isArray(value) && value.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      return !("status" in item) || item.status !== "failed";
    });
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (field.type === "voice" && value && typeof value === "object" && !Array.isArray(value)) {
    const answer = value as { duration?: unknown; audioUrl?: unknown; audioBlobId?: unknown; blob?: unknown };
    return (
      typeof answer.duration === "number" &&
      answer.duration > 0 &&
      Boolean(answer.audioUrl || answer.audioBlobId || answer.blob)
    );
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}

export function PublicFormPage() {
  const { t } = useI18n();
  const { formId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const initialAnswerAuthMode = searchParams.get("identity") === "wallet" ? "sui_wallet" : searchParams.get("identity") === "guest" ? "guest" : null;
  const initialStep = searchParams.get("step") === "answer" ? "form" : "identity";
  const [publicStep, setPublicStep] = useState<"identity" | "form">(initialStep);
  const [answerAuthMode, setAnswerAuthMode] = useState<"guest" | "sui_wallet" | null>(initialAnswerAuthMode);
  const [walletChoicePending, setWalletChoicePending] = useState(false);
  const [submissionOverlayDismissed, setSubmissionOverlayDismissed] = useState(false);
  const [publicFormExpanded, setPublicFormExpanded] = useState(false);
  const [resolvedWalletAddress, setResolvedWalletAddress] = useState<string | undefined>(undefined);
  const [walletProvider, setWalletProvider] = useState<string | undefined>(undefined);
  const manifestBlobId = searchParams.get("manifest") ?? "";
  const nftDebugEnabled = import.meta.env.DEV || searchParams.get("nftDebug") === "1";
  const { form, initialAnswers, loading, loadError, loadErrorDetail } = usePublicFormLoader({
    formId,
    manifestBlobId,
    missingFormMessage: t("publicFormMissingBody"),
  });
  const walletRequired = requiresWalletForFormAccess(form);
  const nftRequired = isNftGatedForm(form);
  const zkLoginSession = !walletRequired && isZkLoginEnabled() ? loadZkLoginSession() : null;
  const walletModeSelected = walletRequired || answerAuthMode === "sui_wallet";
  const walletIdentityReady = walletRequired || (answerAuthMode === "sui_wallet" && Boolean(resolvedWalletAddress));
  const identityMode = walletIdentityReady ? "wallet" : zkLoginSession ? "zklogin" : "anonymous";
  const attachWallet = walletModeSelected;
  const walletFallback = <div className="wallet-connect-shell wallet-connect-shell-compact" />;
  const nftGate = usePublicNftGate(form, resolvedWalletAddress);
  const nftCollectionArt = resolveNftCollectionArt(nftGate.nftGate);
  const nftDebugInfo = nftGate.debugInfo ?? {
    connectedAddress: resolvedWalletAddress ?? "",
    network: nftGate.nftGate?.network ?? "sui-mainnet",
    rpcEndpoint: "",
    targetTypes: nftGate.nftGate?.structType ? [nftGate.nftGate.structType] : [],
    directOwnedCount: 0,
    kioskCount: 0,
    kioskItemCount: 0,
    directOwnedPages: [],
    kioskPages: [],
    directOwnedTypes: [],
    kioskItemTypes: [],
    kioskItemsByKiosk: [],
    requiredTypeBreakdown: [],
    typeComparisons: [],
    matchedDirectObjects: [],
    matchedKioskItems: [],
    sampleObjectTypes: [],
    zeroCountReason: "not_checked_yet",
    lastError: undefined,
  };
  const nftSubmitGateEnabled = nftRequired && nftGate.submitGateActive;
  const {
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
  } = usePublicSubmission({
    form,
    initialAnswers,
    accountAddress: resolvedWalletAddress,
    walletProvider,
    attachWallet,
    walletRequired,
    zkLoginSession,
    identityMode,
    manifestBlobId,
    requiredFieldError: t("requiredFieldError"),
    responseDeadlinePassedLabel: t("formResponseClosed"),
    localFallbackNotice: t("signalStoredLocally"),
    suiRegistrationDeferredNotice: t("suiRegistrationDeferredNotice"),
    submitFailedLabel: t("submitFailed"),
    attachmentTooLargeLabel: (fieldLabel, maxSizeBytes) =>
      t("uploadTooLarge", {
        fieldLabel,
        maxSize: `${Math.round(maxSizeBytes / (1024 * 1024))}MB`,
      }),
    requiredLocationError: t("locationRequiredFriendly"),
    locationPromptLabel: t("locationPromptLabel"),
    locationDeniedLabel: t("locationDeniedLabel"),
    locationUnavailableLabel: t("locationUnavailableLabel"),
    locationFailedLabel: t("locationFailedLabel"),
    zkLoginSessionExpiredLabel: t("publicZkLoginSessionExpired"),
    zkLoginProviderLabel: t("publicZkLoginProvider"),
    recheckNftAccess: nftSubmitGateEnabled ? nftGate.recheckAccess : undefined,
  });

  useEffect(() => {
    preloadSuccessMascot();
  }, []);

  useEffect(() => {
    if (walletRequired) {
      setAnswerAuthMode("sui_wallet");
      setPublicStep("form");
    }
  }, [walletRequired]);

  useEffect(() => {
    if (walletChoicePending && resolvedWalletAddress) {
      setAnswerAuthMode("sui_wallet");
      setPublicStep("form");
      setWalletChoicePending(false);
    }
  }, [resolvedWalletAddress, walletChoicePending]);

  useEffect(() => {
    if (submitting || submitPipeline.status !== "failed") {
      setSubmissionOverlayDismissed(false);
    }
  }, [submitting, submitPipeline.status]);

  const handleWalletAccountAddressChange = useCallback((address?: string) => {
    setResolvedWalletAddress(address);
  }, []);

  const handleWalletProviderChange = useCallback((provider?: string) => {
    setWalletProvider(provider);
  }, []);

  function renderWalletAccountPanel({
    fallback = walletFallback,
    hidden = false,
    className,
  }: {
    fallback?: ReactNode;
    hidden?: boolean;
    className?: string;
  } = {}) {
    const containerProps = hidden
      ? ({
          "aria-hidden": true,
          style: { display: "none" },
        } as const)
      : undefined;

    return (
      <LazyWalletSurface fallback={fallback}>
        <div className={className} {...containerProps}>
          <Suspense fallback={fallback}>
            <LazyPublicWalletAccountPanel
              onAccountAddressChange={handleWalletAccountAddressChange}
              onWalletProviderChange={handleWalletProviderChange}
            />
          </Suspense>
        </div>
      </LazyWalletSurface>
    );
  }

  const groupedFields = useMemo(() => {
    if (!form) {
      return { sections: [], unsectionedFields: [] };
    }
    const currentlyVisibleFieldIds = getVisibleFieldIds(form.fields, answers);
    const orderedFields = getOrderedFields(form.fields);
    return {
      sections: (form.sections ?? []).map((section) => ({
        ...section,
        fields: orderedFields.filter((field) => field.sectionId === section.id && currentlyVisibleFieldIds.has(field.id)),
      })),
      unsectionedFields: orderedFields.filter((field) => !field.sectionId && currentlyVisibleFieldIds.has(field.id)),
    };
  }, [answers, form]);

  const questionNumbers = useMemo(() => {
    const visibleFields = form ? getOrderedFields(form.fields).filter((field) => visibleFieldIds.has(field.id)) : [];
    return new Map(visibleFields.map((field, index) => [field.id, index + 1]));
  }, [form, visibleFieldIds]);
  const responseWindowPending = useMemo(() => isResponseWindowPending(form?.responseOpenAt), [form?.responseOpenAt]);
  const responseWindowClosed = useMemo(
    () => isResponseWindowClosed(form?.responseOpenAt, form?.responseDeadline),
    [form?.responseDeadline, form?.responseOpenAt],
  );
  const deadlineLabel = useMemo(() => {
    const responseDeadlineLabels: ResponseDeadlineLabels = {
      noLimit: t("responseDeadlineNone"),
      notOpen: t("responseWindowScheduled"),
      closed: t("responseDeadlineClosed"),
      hoursLeft: (hours) => t("responseDeadlineHoursLeft", { count: hours }),
      daysLeft: (days) => t("responseDeadlineDaysLeft", { count: days }),
    };
    return formatResponseDeadline(form?.responseDeadline, responseDeadlineLabels, form?.responseOpenAt);
  }, [form?.responseDeadline, form?.responseOpenAt, t]);
  const submitModeLabel =
    walletModeSelected
      ? t("publicSubmitModeWallet")
      : t("publicSubmitModeAnonymous");
  const locationStatusLabel =
    locationState === "success"
      ? t("locationAttached")
      : locationState === "requesting"
        ? t("locationRequesting")
        : locationState === "denied"
          ? t("locationDenied")
          : locationState === "unsupported"
            ? t("locationUnavailable")
            : locationState === "error"
              ? t("locationFailed")
              : t("locationNotAttached");
  const locationStatusTone =
    locationState === "success"
      ? "success"
      : locationState === "requesting"
        ? "pending"
        : locationState === "denied" || locationState === "unsupported" || locationState === "error"
          ? "warning"
          : form?.locationRequirement === "required"
            ? "required"
            : "idle";
  const locationCardTitle = location
    ? t("locationReadyTitle")
    : form?.locationRequirement === "required"
      ? t("locationActionRequiredTitle")
      : t("locationActionOptionalTitle");
  const locationCardHelp = location
    ? t("locationReadyHelp")
    : form?.locationRequirement === "required"
      ? t("locationActionRequiredHelp")
      : t("locationActionOptionalHelp");
  const submitLaunchState = submitting
    ? "loading"
    : submitted || submitPipeline.status === "complete"
      ? "success"
      : submitError || failure || submitPipeline.status === "failed"
        ? "error"
        : responseWindowClosed || storageConnectionPreparing
          ? "disabled"
          : "idle";
  const submitButtonSubLabel =
    submitLaunchState === "loading"
      ? t("publicSubmitEncryptingSignal")
      : submitLaunchState === "success"
        ? "Secure route confirmed"
        : submitLaunchState === "error"
          ? "Review the route status and retry"
          : storageConnectionPreparing
            ? "Secure route is preparing"
            : walletRequired && !resolvedWalletAddress
              ? t("publicSubmitConnectWalletSecureReport")
              : "Transmit through the active secure route";
  const submissionPipelineLabels = {
    eyebrow: t("publicSubmissionOverlayEyebrow"),
    title: t("publicSubmissionOverlayTitle"),
    intro: t("publicSubmissionOverlayIntro"),
    terminalHeader: t("publicSubmissionTerminalHeader"),
    terminalActive: t("publicSubmissionTerminalActive"),
    terminalFailed: t("publicSubmissionTerminalFailed"),
    statusComplete: t("publicSubmissionStatusComplete"),
    statusInProgress: t("publicSubmissionStatusInProgress"),
    statusQueued: t("publicSubmissionStatusQueued"),
    statusNeedsAttention: t("publicSubmissionStatusNeedsAttention"),
    done: t("publicSubmissionOverlayDone"),
    stages: {
      idle: "Ready",
      preparing: "Preparing signal",
      local_preserved: "Local preserved",
      walrus_uploading: "Uploading to Walrus",
      inbox_syncing: "Syncing inbox",
      completed: "Signal sent",
    } satisfies Record<SignalPipelineStage, string>,
  };
  const attachmentMaxBytes = form?.encryptSubmissions
    ? ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES
    : DEFAULT_ATTACHMENT_MAX_BYTES;
  const attachmentLimitMb = Math.round(attachmentMaxBytes / (1024 * 1024));
  const requiredProgress = useMemo(() => {
    if (!form) {
      return { completed: 0, missing: 0, total: 0 };
    }
    const requiredFields = getOrderedFields(form.fields).filter((field) =>
      isFieldRequired(field, form.fields, answers, visibleFieldIds.has(field.id)),
    );
    const completed = requiredFields.filter((field) => hasPublicAnswerValue(field, answers[field.id])).length;
    return {
      completed,
      missing: requiredFields.length - completed,
      total: requiredFields.length,
    };
  }, [answers, form, visibleFieldIds]);
  const progressLabel =
    requiredProgress.total > 0
      ? t("publicSubmitBarRequired", {
          completed: requiredProgress.completed,
          total: requiredProgress.total,
        })
      : t("publicProgressReady");
  const remainingEstimate =
    requiredProgress.missing > 1
      ? t("publicProgressMinutesRemaining", {
          minutes: Math.min(3, Math.max(1, Math.ceil(requiredProgress.missing / 2))),
        })
      : requiredProgress.missing === 1
        ? t("publicProgressMinuteRemaining")
        : t("publicSubmitBarReady");
  const visibleErrorCount = useMemo(
    () => Object.entries(errors).filter(([fieldId, message]) => visibleFieldIds.has(fieldId) && Boolean(message)).length,
    [errors, visibleFieldIds],
  );
  const submitReadinessLabel = responseWindowClosed
    ? responseWindowPending
      ? t("publicSubmitBarScheduled")
      : t("publicSubmitBarClosed")
    : storageConnectionPreparing
      ? "Storage is preparing. Please wait a few seconds."
      : visibleErrorCount > 0
      ? t("publicSubmitBarErrors", { count: visibleErrorCount })
      : requiredProgress.missing > 0
        ? t("publicSubmitBarRequired", {
            completed: requiredProgress.completed,
            total: requiredProgress.total,
          })
        : t("publicSubmitBarReady");
  const attachmentSizeErrorMessage = (maxSizeBytes: number) =>
    t("uploadTooLarge", {
      fieldLabel: "Attachment",
      maxSize: `${Math.round(maxSizeBytes / (1024 * 1024))}MB`,
    });
  const [attachedContext, setAttachedContext] = useState<AttachedSignalContext>(() =>
    collectSignalContext({
      form: null,
      manifestBlobId,
      walletAddress: walletModeSelected ? resolvedWalletAddress : undefined,
      walletProvider: walletModeSelected ? walletProvider : undefined,
    }),
  );

  useEffect(() => {
    function updateAttachedContext() {
      setAttachedContext(
        collectSignalContext({
          form,
          manifestBlobId,
          walletAddress: walletModeSelected ? resolvedWalletAddress : undefined,
          walletProvider: walletModeSelected ? walletProvider : undefined,
        }),
      );
    }
    updateAttachedContext();
    window.addEventListener("resize", updateAttachedContext);
    return () => window.removeEventListener("resize", updateAttachedContext);
  }, [form, manifestBlobId, resolvedWalletAddress, walletModeSelected, walletProvider]);

  function getAttachmentHint(fieldType: "screenshot" | "video") {
    const baseHint = fieldType === "screenshot" ? t("screenshotHint") : t("videoHint");
    const maxSizeHint = t("attachmentMaxFileSize", {
      hint: baseHint,
      size: attachmentLimitMb,
    });
    if (!form?.encryptSubmissions) {
      return maxSizeHint;
    }
    return `${maxSizeHint} Encrypted attachments are limited to ${attachmentLimitMb}MB.`;
  }

  function handleSelectGuestMode() {
    triggerHaptic(12);
    setAnswerAuthMode("guest");
    setWalletChoicePending(false);
  }

  function handleSelectGuestAndContinue() {
    handleSelectGuestMode();
    setPublicStep("form");
  }

  function handleSelectWalletMode() {
    triggerHaptic(12);
    setAnswerAuthMode("sui_wallet");
  }

  function handleSelectWalletAndContinue() {
    triggerHaptic([10, 24, 12]);
    handleSelectWalletMode();
    if (resolvedWalletAddress) {
      setPublicStep("form");
      setWalletChoicePending(false);
      return;
    }
    setWalletChoicePending(true);
  }

  function handleGuestCardClick(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    setAnswerAuthMode("guest");
    setWalletChoicePending(false);
  }

  function handleWalletCardClick(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    handleSelectWalletMode();
  }

  if (loading) {
    return <div className="panel">{t("loadingPublicForm")}</div>;
  }

  if (!form) {
    const errorTitle =
      loadErrorDetail?.code === "form_id_mismatch"
        ? t("sharedLinkMismatchTitle")
        : loadErrorDetail
          ? t("sharedLinkUnavailableTitle")
          : t("emptyFormNotFound");
    const retryGuidance =
      loadErrorDetail?.code === "form_id_mismatch"
        ? t("sharedLinkMismatchGuidance")
        : loadErrorDetail
          ? t("sharedLinkRepublishGuidance")
          : "";
    return (
      <EmptyState>
        <h1>{errorTitle}</h1>
        <p>{loadError || t("publicFormMissingBody")}</p>
        {loadErrorDetail ? (
          <div className="metadata-list">
            <div className="metadata-row">
              <span>{t("sharedLinkFailureReason")}</span>
              <strong>{loadErrorDetail.reason}</strong>
            </div>
            <div className="metadata-row">
              <span>{t("expectedFormId")}</span>
              <strong>{loadErrorDetail.expectedFormId ?? formId}</strong>
            </div>
            {loadErrorDetail.actualFormId ? (
              <div className="metadata-row">
                <span>{t("actualFormId")}</span>
                <strong>{loadErrorDetail.actualFormId}</strong>
              </div>
            ) : null}
            {loadErrorDetail.manifestBlobId ? (
              <div className="metadata-row">
                <span>{t("manifestBlobId")}</span>
                <PublicSignalMetaChip type="manifest" value={loadErrorDetail.manifestBlobId} />
              </div>
            ) : null}
            {loadErrorDetail.formBlobId ? (
              <div className="metadata-row">
                <span>{t("formBlobId")}</span>
                <PublicSignalMetaChip type="blob" value={loadErrorDetail.formBlobId} />
              </div>
            ) : null}
            {loadErrorDetail.manifestStatus ? (
              <div className="metadata-row">
                <span>{t("walrusBlobStatus")}</span>
                <strong>{loadErrorDetail.manifestStatus}</strong>
              </div>
            ) : null}
            {loadErrorDetail.formBlobStatus ? (
              <div className="metadata-row">
                <span>{t("linkedBlobStatus")}</span>
                <strong>{loadErrorDetail.formBlobStatus}</strong>
              </div>
            ) : null}
            {loadErrorDetail.failedAssetPath ? (
              <>
                <div className="metadata-row">
                  <span>{t("failedAsset")}</span>
                  <strong>{loadErrorDetail.failedAssetPath}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("assetStatus")}</span>
                  <strong>
                    {loadErrorDetail.failedAssetStatus ?? "unknown"}
                    {loadErrorDetail.failedAssetContentType ? ` · ${loadErrorDetail.failedAssetContentType}` : ""}
                  </strong>
                </div>
                <div className="metadata-row">
                  <span>{t("assetProbeAttempts")}</span>
                  <strong>{loadErrorDetail.failedAssetAttempts ?? 1}</strong>
                </div>
                {loadErrorDetail.failedAssetBuild ? (
                  <div className="metadata-row">
                    <span>{t("assetBuild")}</span>
                    <strong>{loadErrorDetail.failedAssetBuild}</strong>
                  </div>
                ) : null}
                {loadErrorDetail.failedAssetUrl ? (
                  <div className="metadata-row">
                    <span>{t("assetUrl")}</span>
                    <strong>{loadErrorDetail.failedAssetUrl}</strong>
                  </div>
                ) : null}
                {loadErrorDetail.failedAssetErrorMessage ? (
                  <div className="metadata-row">
                    <span>{t("assetNetworkError")}</span>
                    <strong>{loadErrorDetail.failedAssetErrorMessage}</strong>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="metadata-row">
              <span>{t("retryGuidance")}</span>
              <strong>{retryGuidance || loadErrorDetail.guidance}</strong>
            </div>
            {loadErrorDetail.republishPath ? (
              <div className="inline-actions">
                <Link className="primary-button" to={loadErrorDetail.republishPath}>
                  {t("republish")}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </EmptyState>
    );
  }

  if (publicStep === "identity") {
    const guestSelected = answerAuthMode === "guest";
    const walletSelected = walletRequired || answerAuthMode === "sui_wallet";
    return (
      <section className="panel glow-panel public-identity-choice-screen" aria-label={t("publicIdentityChoiceTitle")}>
        <div className="public-identity-choice-hero">
          <div className="public-identity-choice-copy">
            <div className="public-identity-choice-title-row">
              <span className="public-identity-choice-hero-icon" aria-hidden="true">SIG</span>
              <p className="eyebrow">{t("publicIdentityChoiceEyebrow")}</p>
            </div>
            <h1>{t("publicIdentityChoiceTitle")}</h1>
            <p className="muted">
              {walletRequired ? t("publicIdentityChoiceBodyWalletRequired") : t("publicIdentityChoiceBody")}
            </p>
          </div>
          <button type="button" className="public-identity-choice-help" disabled>
            {t("publicIdentityChoiceHelp")}
          </button>
        </div>
        <div className="public-identity-choice-grid">
          {!walletRequired ? (
            <article
              className={`answer-card public-identity-choice-card is-guest ${guestSelected ? "is-selected" : ""}`}
              onClick={handleGuestCardClick}
            >
              <div className="public-identity-choice-card-head public-identity-choice-card-head-capsule">
                <div className="public-identity-capsule-core is-guest" aria-hidden="true">
                  <span className="public-identity-capsule-ripple" />
                  <span className="public-identity-choice-icon">Anon</span>
                  <span className="public-identity-capsule-status">Ready</span>
                </div>
                <button
                  type="button"
                  className={`public-identity-choice-radio ${guestSelected ? "is-selected" : ""}`}
                  aria-label={t("publicIdentityChoiceAnonymousLabel")}
                  aria-pressed={guestSelected}
                  onClick={handleSelectGuestMode}
                />
              </div>
              <div className="public-identity-choice-card-copy">
                <div className="public-identity-choice-heading public-identity-choice-heading-capsule">
                  <span className="public-identity-choice-eyebrow">Signal Capsule</span>
                  <strong>{t("publicIdentityChoiceAnonymousLabel")}</strong>
                  <span className="public-identity-choice-tag">{t("publicIdentityChoiceGuestTag")}</span>
                </div>
                <p className="muted">{t("publicIdentityChoiceAnonymousBody")}</p>
                <small className="public-identity-choice-subtitle">{t("publicIdentityChoiceAnonymousReady")}</small>
              </div>
              <ul className="public-identity-choice-list">
                <li>{t("publicIdentityChoiceGuestPoint1")}</li>
                <li>{t("publicIdentityChoiceGuestPoint2")}</li>
                <li>{t("publicIdentityChoiceGuestPoint3")}</li>
              </ul>
              <div className="public-identity-choice-terminal-spacer" aria-hidden="true" />
              <button type="button" className="ghost-button signal-capsule-action is-guest" onClick={handleSelectGuestAndContinue}>
                <span className="signal-capsule-action-icon" aria-hidden="true">{"\u25ce"}</span>
                <span className="signal-capsule-action-copy">
                  <strong>{t("publicIdentityChoiceAnonymousCta")}</strong>
                  <small>{t("publicIdentityChoiceAnonymousReady")}</small>
                </span>
              </button>
              <p className="muted public-identity-choice-card-note">{t("publicIdentityChoiceAnonymousReady")}</p>
            </article>
          ) : null}
          <article
            className={`answer-card public-identity-choice-card is-wallet ${resolvedWalletAddress ? "is-connected" : ""} ${walletSelected ? "is-selected" : ""}`}
            onClick={handleWalletCardClick}
          >
            <div className="public-identity-choice-card-head public-identity-choice-card-head-capsule">
              <div className="public-identity-capsule-core is-wallet" aria-hidden="true">
                <span className="public-identity-capsule-ripple" />
                <span className="public-identity-choice-icon is-wallet">Sui</span>
                <span className="public-identity-capsule-status">{resolvedWalletAddress ? "Linked" : "Standby"}</span>
              </div>
              <button
                type="button"
                className={`public-identity-choice-radio ${walletSelected ? "is-selected" : ""}`}
                aria-label={t("publicIdentityChoiceWalletLabel")}
                aria-pressed={walletSelected}
                onClick={handleSelectWalletMode}
              />
            </div>
            <div className="public-identity-choice-card-copy">
              <div className="public-identity-choice-heading public-identity-choice-heading-capsule">
                <span className="public-identity-choice-eyebrow">Verified Capsule</span>
                <strong>{t("publicIdentityChoiceWalletLabel")}</strong>
                <span className="public-identity-choice-tag is-wallet">{t("publicIdentityChoiceWalletTag")}</span>
              </div>
              <p className="muted">
                {walletRequired ? t("publicIdentityChoiceWalletBodyRequired") : t("publicIdentityChoiceWalletBody")}
              </p>
              <small className="public-identity-choice-subtitle">
                {resolvedWalletAddress ? t("publicIdentityChoiceWalletConnected") : t("publicIdentityChoiceWalletConnectPrompt")}
              </small>
            </div>
            <ul className="public-identity-choice-list is-wallet">
              <li>{t("publicIdentityChoiceWalletPoint1")}</li>
              <li>{t("publicIdentityChoiceWalletPoint2")}</li>
              <li>{t("publicIdentityChoiceWalletPoint3")}</li>
            </ul>
            {walletSelected || walletRequired ? (
              renderWalletAccountPanel({ className: "public-identity-choice-wallet-shell" })
            ) : null}
            <button
              type="button"
              className="primary-button signal-capsule-action is-wallet"
              onClick={handleSelectWalletAndContinue}
              disabled={!resolvedWalletAddress}
            >
              <span className="signal-capsule-action-icon" aria-hidden="true">{"\u25c9"}</span>
              <span className="signal-capsule-action-copy">
                <strong>{t("publicIdentityChoiceWalletCta")}</strong>
                <small>{resolvedWalletAddress ? "Verified route armed" : "Connect wallet to arm this route"}</small>
              </span>
            </button>
            <p className="muted public-identity-choice-card-note">
              {resolvedWalletAddress ? t("publicIdentityChoiceWalletConnected") : t("publicIdentityChoiceWalletConnectPrompt")}
            </p>
          </article>
        </div>
        <div className="public-identity-choice-footer">
          <div className="public-identity-choice-footer-copy">
            <span className="public-identity-choice-icon is-footer" aria-hidden="true">Safe</span>
            <div>
              <strong>{t("publicIdentityChoicePrivacyTitle")}</strong>
              <p className="muted">{t("publicIdentityChoicePrivacyBody")}</p>
            </div>
          </div>
          <button type="button" className="ghost-button" disabled>
            {t("publicIdentityChoicePrivacyAction")}
          </button>
        </div>
      </section>
    );
  }

  if (nftRequired && nftGate.viewGateActive && !nftGate.canViewForm) {
    return (
      <section className="panel glow-panel public-identity-choice-screen public-nft-gate-screen" aria-label="NFT gated signal">
        <div className="public-identity-choice-hero">
          <div className="public-identity-choice-copy">
            <div className="public-identity-choice-title-row">
              {nftCollectionArt ? (
                <img
                  className="public-identity-choice-hero-icon public-identity-choice-hero-art"
                  src={nftCollectionArt.src}
                  alt={nftCollectionArt.alt}
                />
              ) : (
                <span className="public-identity-choice-hero-icon" aria-hidden="true">NFT</span>
              )}
              <p className="eyebrow">{t("publicNftGateEyebrow")}</p>
            </div>
            <h1>{form.title}</h1>
            <p className="muted">
              {t("publicNftGateBody")}
            </p>
          </div>
        </div>
        <div className="metadata-list">
          <div className="metadata-row">
            <span>{t("publicNftGateCollectionLabel")}</span>
            <strong>{nftGate.nftGate?.collectionLabel ?? t("publishNftCustomPresetLabel")}</strong>
          </div>
          <div className="metadata-row">
            <span>{t("publicNftGateRequiredCountLabel")}</span>
            <strong>{nftGate.nftGate?.requiredCount ?? 1}</strong>
          </div>
          <div className="metadata-row">
            <span>{t("publicNftGateOwnedCountLabel")}</span>
            <strong>{nftGate.ownedCount}</strong>
          </div>
          {nftGate.nftGate?.structType ? (
            <div className="metadata-row">
              <span>{t("publishNftStructTypeLabel")}</span>
              <strong>{nftGate.nftGate.structType}</strong>
            </div>
          ) : null}
        </div>
        {nftGate.isChecking ? <p className="muted">{t("publicNftGateChecking")}</p> : null}
        {!resolvedWalletAddress ? (
          <p className="muted">{t("publicNftGateConnectPrompt")}</p>
        ) : null}
        {renderWalletAccountPanel({
          className: "public-identity-choice-wallet-shell",
        })}
        {nftGate.gateError ? <p className="error-text">{nftGate.gateError}</p> : null}
        {nftDebugEnabled && resolvedWalletAddress ? (
          <details className="answer-card answer-card-plain">
            <summary>NFT gate debug</summary>
            <pre className="muted">{JSON.stringify(nftDebugInfo, null, 2)}</pre>
          </details>
        ) : null}
        {resolvedWalletAddress && nftGate.hasResolvedOwnership && !nftGate.isChecking && !nftGate.gateError ? (
          <p className="error-text">{t("publicNftGateNotEligible")}</p>
        ) : null}
      </section>
    );
  }

  function renderInlineNftGateCard() {
    if (!nftRequired || nftGate.viewGateActive) {
      return null;
    }

    const collectionLabel = nftGate.nftGate?.collectionLabel ?? t("publishNftCustomPresetLabel");
    const statusCopy = nftGate.submitGateActive
      ? !resolvedWalletAddress
        ? t("publicNftGateSubmitConnectPrompt")
        : nftGate.isChecking
          ? t("publicNftGateCheckingConnected")
          : nftGate.meetsRequirement
            ? t("publicNftGateEligible")
            : t("publicNftGateVisibleSubmitRestricted")
      : t("publicNftGateVisibleWithoutVerification");

    return (
      <section className="answer-card answer-card-plain public-nft-inline-card" aria-label={t("publicNftGateInlineAriaLabel")}>
        <div className="section-row">
          <div>
            <p className="eyebrow">{t("publicNftGateInlineEyebrow")}</p>
            <h3>{collectionLabel}</h3>
            <p className="muted">{statusCopy}</p>
          </div>
          <span className={`signal-chip ${nftGate.meetsRequirement ? "signal-chip-success" : "signal-chip-muted"}`}>
            {nftGate.submitGateActive
              ? nftGate.meetsRequirement
                ? t("publicNftGateEligibleBadge")
                : t("publicNftGateVerificationNeededBadge")
              : t("publicNftGateViewOnlyBadge")}
          </span>
        </div>
        <div className="metadata-list">
          <div className="metadata-row">
            <span>{t("publicNftGateRequiredCountLabel")}</span>
            <strong>{nftGate.nftGate?.requiredCount ?? 1}</strong>
          </div>
          <div className="metadata-row">
            <span>{t("publicNftGateOwnedCountLabel")}</span>
            <strong>{nftGate.ownedCount}</strong>
          </div>
          <div className="metadata-row">
            <span>{t("networkLabel")}</span>
            <strong>{nftGate.nftGate?.network ?? t("notAvailable")}</strong>
          </div>
        </div>
        {nftGate.nftGate?.structType ? (
          <p className="muted">{`${t("publishNftStructTypeLabel")}: ${nftGate.nftGate.structType}`}</p>
        ) : null}
        {nftGate.isChecking ? <p className="muted">{t("publicNftGateChecking")}</p> : null}
        {renderWalletAccountPanel({
          className: "public-identity-choice-wallet-shell",
        })}
        {nftGate.gateError ? <p className="error-text">{nftGate.gateError}</p> : null}
        {nftDebugEnabled && resolvedWalletAddress ? (
          <details className="answer-card answer-card-plain">
            <summary>NFT gate debug</summary>
            <pre className="muted">{JSON.stringify(nftDebugInfo, null, 2)}</pre>
          </details>
        ) : null}
        {resolvedWalletAddress && nftGate.hasResolvedOwnership && !nftGate.isChecking && !nftGate.gateError && nftGate.submitGateActive && !nftGate.meetsRequirement ? (
          <p className="error-text">{t("publicNftGateNotEligible")}</p>
        ) : null}
      </section>
    );
  }

  if (submitted) {
    return (
      <Suspense
        fallback={
          <PublicFormSuccessFallback
            signalReceivedLabel={t("signalReceived")}
            headline={t("publicReceiptHeadline")}
            savedCopy={t("publicReceiptSubcopySaved")}
            retryCopy={t("publicReceiptSubcopyRetry")}
          />
        }
      >
        <LazyPublicFormSuccess
          submitted={submitted}
          submitNotice={submitNotice}
          notAvailableLabel={t("notAvailable")}
          pendingSuiRegistrationLabel={t("pendingSuiRegistration")}
          signalReceivedLabel={t("signalReceived")}
          thanksForFeedbackLabel={t("thanksForFeedback")}
        />
      </Suspense>
    );
  }

  function triggerWalletReconnect() {
    const walletButton = document.querySelector<HTMLButtonElement>(".public-identity-choice-wallet-shell button");
    walletButton?.click();
    walletButton?.focus();
  }

  function retrySubmit() {
    const formElement = document.querySelector<HTMLFormElement>("form.public-form");
    formElement?.requestSubmit();
  }

  const failureActions =
    recoveryCorrupted
      ? [{ key: "discard", label: t("discardRecovery"), onClick: discardRecovery }]
      : failure?.kind === "wallet_disconnected"
      ? [{ key: "reconnect", label: t("reconnectWallet"), onClick: triggerWalletReconnect }]
      : failure?.kind === "registry_failed"
        ? [{ key: "retry", label: t("retryLabel"), onClick: retrySubmit, disabled: storageConnectionPreparing }]
        : failure?.retryable
          ? [{ key: "retry", label: t("retryLabel"), onClick: retrySubmit, disabled: storageConnectionPreparing }]
          : [];
  const preservedLocally = signalFailureState === "offline_preserved" || signalFailureState === "sync_failed";

  return (
    <form className={`panel glow-panel public-form ${publicFormExpanded ? "is-expanded" : ""}`} onSubmit={handleSubmit}>
      {walletModeSelected ? renderWalletAccountPanel({ hidden: true, fallback: null }) : null}
      <div className="public-form-header-frame">
        <FormHeaderImage
          image={form.headerImage}
          logo={form.headerLogo}
          className="public-form-header-image"
          fallbackTitle={form.title}
          signalId={form.id}
        />
        <button
          type="button"
          className="public-form-size-toggle"
          aria-pressed={publicFormExpanded}
          aria-label={publicFormExpanded ? t("publicFormSizeToggleShrink") : t("publicFormSizeToggleExpand")}
          title={publicFormExpanded ? t("publicFormSizeToggleShrink") : t("publicFormSizeToggleExpand")}
          onClick={() => setPublicFormExpanded((expanded) => !expanded)}
        >
          {publicFormExpanded ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 4H4v5" />
              <path d="M4 4l6 6" />
              <path d="M15 20h5v-5" />
              <path d="M20 20l-6-6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M15 4h5v5" />
              <path d="M20 4l-6 6" />
              <path d="M9 20H4v-5" />
              <path d="M4 20l6-6" />
            </svg>
          )}
        </button>
      </div>
      <section className={`public-trust-header ${responseWindowClosed ? "is-expired" : ""}`} aria-label={t("publicFormStatusSummary")}>
        <div className="public-trust-heading-row">
          <div className="public-trust-copy">
            <p className="eyebrow">Secure reporting workflow</p>
            <h1>{form.title}</h1>
            <RichTextContent value={form.description ?? ""} className="lede rich-text-content" fallback={t("publicDefaultBody")} />
          </div>
          <span className={`public-form-status-badge public-form-deadline-badge ${responseWindowClosed ? "is-expired" : "is-live"}`}>
            <span>{t("publicResponseWindow")}</span>
            <strong>
              {responseWindowClosed
                ? responseWindowPending
                  ? t("publicWindowScheduledBadge")
                  : t("publicDeadlineClosedBadge")
                : deadlineLabel}
            </strong>
          </span>
        </div>
        <div className="public-trust-footer">
          <p className="muted">
            {responseWindowClosed
              ? responseWindowPending
                ? t("publicWindowScheduledHelp")
                : t("publicDeadlineClosedHelp")
              : form.encryptSubmissions
                ? "This workflow creates a secure report with verifiable storage metadata."
                : "This workflow stays public-facing while preserving review controls."}
          </p>
        </div>
      </section>
      {hasRecoverableDraft ? (
        <RecoverableDraftBanner
          title={t("recoverableDraftTitle")}
          description={
            form.fields.some((field) => field.type === "screenshot" || field.type === "video" || field.type === "voice")
              ? "Media drafts are not restored. Re-add screenshots, videos, or voice recordings before sending."
              : undefined
          }
          restoreLabel={t("restore")}
          discardLabel={t("discard")}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
        />
      ) : null}
      {renderInlineNftGateCard()}

      <div className="stack public-form-fields">
        <div className="public-progress-row" aria-live="polite">
          <span>{progressLabel}</span>
          <small>{remainingEstimate}</small>
        </div>
        {form.locationRequirement === "required" ? (
          <section
            className={`public-location-card ${locationState === "success" ? "is-success" : ""} is-${locationStatusTone}`}
            aria-live="polite"
          >
            <div className="public-location-card-copy">
              <p className="eyebrow">{t("locationRequirementEyebrow")}</p>
              <div className={`public-location-status-badge is-${locationStatusTone}`}>
                <span>{form.locationRequirement === "required" ? t("locationRequirementRequired") : t("locationRequirementOptional")}</span>
                <strong>{locationStatusLabel}</strong>
              </div>
              <h3>{locationCardTitle}</h3>
              <p className="muted">{locationCardHelp}</p>
            </div>
            <div className="public-location-card-body">
              <div className="public-location-actions">
                <button
                  type="button"
                  className="primary-button public-location-primary-action signal-capsule-action signal-capsule-action-location"
                  onClick={() => {
                    triggerHaptic([10, 18, 10]);
                    void requestLocation();
                  }}
                  disabled={responseWindowClosed || locationState === "requesting"}
                >
                  <span className="signal-capsule-action-icon" aria-hidden="true">
                    {location ? "\u25ce" : "\u2316"}
                  </span>
                  <span className="signal-capsule-action-copy">
                    <strong>{location ? t("locationRecapture") : t("locationAttachAction")}</strong>
                    <small>{location ? t("locationReadyHelp") : locationCardHelp}</small>
                  </span>
                </button>
                {location ? (
                  <button
                    type="button"
                    className="ghost-button public-location-secondary-action"
                    onClick={() => {
                      triggerHaptic(10);
                      clearLocation();
                    }}
                    disabled={responseWindowClosed || locationState === "requesting"}
                  >
                    {t("locationRemoveAction")}
                  </button>
                ) : null}
              </div>
              <div className="public-location-facts" role="list" aria-label={t("locationRequirementLabel")}>
                <div className="public-location-fact" role="listitem">
                  <span>{t("locationRequirementLabel")}</span>
                  <strong>{form.locationRequirement === "required" ? t("locationRequirementRequired") : t("locationRequirementOptional")}</strong>
                </div>
                <div className="public-location-fact" role="listitem">
                  <span>{t("locationStatusLabel")}</span>
                  <strong>{locationStatusLabel}</strong>
                </div>
                {location ? (
                  <>
                    <div className="public-location-fact" role="listitem">
                      <span>{t("locationAccuracyLabel")}</span>
                      <strong>{`${Math.round(location.accuracy)}m`}</strong>
                    </div>
                    <div className="public-location-fact" role="listitem">
                      <span>{t("locationCapturedAtLabel")}</span>
                      <strong>{new Date(location.capturedAt).toLocaleString()}</strong>
                    </div>
                  </>
                ) : null}
              </div>
              {locationMessage ? <p className="public-location-message">{locationMessage}</p> : null}
              {submitError && form.locationRequirement === "required" && !location ? <p className="error-text">{submitError}</p> : null}
            </div>
          </section>
        ) : null}
        {groupedFields.sections.map((section) =>
          section.fields.length ? (
            <section key={section.id} className="composer-preview-section">
              <div className="composer-preview-section-copy">
                <h3>{section.title}</h3>
                {section.description ? <p className="muted">{section.description}</p> : null}
              </div>
              <div className="stack public-form-fields">
                {section.fields.map((field) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={answers[field.id]}
                    error={errors[field.id]}
                    attachmentMaxSizeBytes={attachmentMaxBytes}
                    attachmentMaxSizeErrorMessage={attachmentSizeErrorMessage}
                    questionNumber={questionNumbers.get(field.id)}
                    required={isFieldRequired(field, form.fields, answers, true)}
                    hint={
                      field.type === "screenshot" ? getAttachmentHint("screenshot") : field.type === "video" ? getAttachmentHint("video") : undefined
                    }
                    onChange={(value) => updateAnswer(field.id, value)}
                    disabled={responseWindowClosed}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}
        {groupedFields.unsectionedFields.map((field) => (
          <DynamicField
            key={field.id}
            field={field}
            value={answers[field.id]}
            error={errors[field.id]}
            attachmentMaxSizeBytes={attachmentMaxBytes}
            attachmentMaxSizeErrorMessage={attachmentSizeErrorMessage}
            questionNumber={questionNumbers.get(field.id)}
            required={isFieldRequired(field, form.fields, answers, true)}
            hint={
              field.type === "screenshot" ? getAttachmentHint("screenshot") : field.type === "video" ? getAttachmentHint("video") : undefined
            }
            onChange={(value) => updateAnswer(field.id, value)}
            disabled={responseWindowClosed}
          />
        ))}
      </div>

      <AttachedSignalContextPanel context={attachedContext} />

      <SignalSubmissionPipeline
        pipeline={submitPipeline}
        visible={submitting || ((submitPipeline.status === "failed" || submitPipeline.status === "pending") && !submissionOverlayDismissed)}
        labels={submissionPipelineLabels}
        onClose={() => setSubmissionOverlayDismissed(true)}
      />

      {failure ? (
        <CriticalFailurePanel
          failure={failure}
          title={t("submitRecoveryTitle")}
          copyLabel={t("copyDiagnostics")}
          copiedLabel={t("diagnosticsCopied")}
          guidance={recoveryGuidance}
          copied={diagnosticsCopied}
          actions={failureActions}
          onCopyDiagnostics={copyDiagnostics}
        />
      ) : null}
      <LocalRecoveryCenter formId={form.id} />
      {submitError && !failure ? <p className="error-text">{submitError}</p> : null}
      <div className="public-form-actions">
        <div className="public-submit-bar-copy" aria-live="polite">
          <span>{submitReadinessLabel}</span>
          <strong>{submitModeLabel}</strong>
        </div>
        <HoldToSendButton
          state={submitLaunchState}
          disabled={submitting || responseWindowClosed || storageConnectionPreparing}
          label={
            submitted || submitPipeline.status === "complete"
              ? "Signal sent"
              : preservedLocally
                ? "Signal preserved locally"
                : responseWindowClosed
                  ? responseWindowPending
                    ? t("publicSubmissionScheduled")
                    : t("publicSubmissionClosed")
                  : "Hold to send signal"
          }
          subLabel={
            preservedLocally
              ? "Retry when storage is reachable"
              : submitLaunchState === "error"
                ? "Release and hold again to retry"
                : submitButtonSubLabel
          }
          onComplete={() => {
            triggerHaptic([12, 22, 16]);
            retrySubmit();
          }}
        />
      </div>
    </form>
  );
}

export default PublicFormPage;

function HoldToSendButton({
  state,
  disabled,
  label,
  subLabel,
  onComplete,
}: {
  state: "idle" | "loading" | "success" | "error" | "disabled";
  disabled: boolean;
  label: string;
  subLabel: string;
  onComplete: () => void;
}) {
  const holdMs = 1100;
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  function stop(reset = true) {
    setHolding(false);
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (reset) {
      setProgress(0);
    }
  }

  function tick() {
    const elapsed = performance.now() - startRef.current;
    const nextProgress = Math.min(100, (elapsed / holdMs) * 100);
    setProgress(nextProgress);
    if (nextProgress >= 100) {
      stop(false);
      setProgress(100);
      onComplete();
      window.setTimeout(() => setProgress(0), 520);
      return;
    }
    frameRef.current = window.requestAnimationFrame(tick);
  }

  function start() {
    if (disabled || state === "loading" || state === "success") {
      return;
    }
    setHolding(true);
    startRef.current = performance.now();
    frameRef.current = window.requestAnimationFrame(tick);
  }

  useEffect(() => () => stop(), []);

  return (
    <button
      type="button"
      className={`primary-button signal-capsule-action signal-capsule-action-submit hold-signal-button is-${state} ${holding ? "is-holding" : ""}`}
      disabled={disabled}
      style={{ "--hold-progress": `${progress}%` } as CSSProperties}
      onPointerDown={start}
      onPointerUp={() => stop()}
      onPointerLeave={() => stop()}
      onPointerCancel={() => stop()}
      onClick={() => {
        if (!disabled && state !== "loading" && state !== "success" && progress < 100) {
          onComplete();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={() => stop()}
      aria-live="polite"
      aria-label={label}
    >
      <span className="signal-launch-core signal-capsule-action-icon" aria-hidden="true">
        <span className="signal-launch-core-ring" />
        <span className="signal-launch-core-progress" />
        <span className="signal-launch-core-drop">
          <span>SUI</span>
        </span>
        <span className="signal-launch-core-mark" />
      </span>
      <span className="signal-capsule-action-copy">
        <strong>{label}</strong>
        <small>{subLabel}</small>
      </span>
      <span className="signal-launch-vector" aria-hidden="true">
        <span className="signal-launch-particle" />
        <span className="signal-launch-particle" />
        <span className="signal-launch-particle" />
        <span className="signal-launch-arrow" />
      </span>
    </button>
  );
}

function AttachedSignalContextPanel({ context }: { context: AttachedSignalContext }) {
  const { t } = useI18n();
  const compactRows = [
    [t("attachedSignalContextDevice"), `${context.device.type} / ${context.os}`],
    [t("attachedSignalContextBrowser"), `${context.browser} ${context.browserVersion}`],
    [t("attachedSignalContextViewport"), `${context.viewport.width} x ${context.viewport.height} @${context.dpr}x`],
    [t("attachedSignalContextPage"), context.pageName],
    [
      t("attachedSignalContextWallet"),
      context.wallet.connected
        ? `${context.wallet.provider ?? t("attachedSignalContextWalletFallback")} ${context.wallet.address ?? ""}`
        : t("attachedSignalContextWalletNotConnected"),
    ],
    [t("attachedSignalContextNetwork"), context.chain],
    [t("attachedSignalContextLocale"), `${context.locale} / ${context.timezone}`],
  ];
  const capturedIssueCount = context.consoleErrors.length + context.networkErrors.length;

  return (
    <details className="attached-signal-context">
      <summary>
        <span>
          <strong>{t("attachedSignalContextTitle")}</strong>
          <small>{t("attachedSignalContextDescription")}</small>
        </span>
        <span className="attached-signal-context-count">
          {capturedIssueCount > 0 ? t("attachedSignalContextIssueCount", { count: capturedIssueCount }) : t("attachedSignalContextAutoAttached")}
        </span>
      </summary>
      <div className="attached-signal-context-grid">
        {compactRows.map(([label, value]) => (
          <div key={label} className="metadata-row">
            <span>{label}</span>
            <strong>{value || t("unknown")}</strong>
          </div>
        ))}
        <div className="metadata-row">
          <span>URL</span>
          <strong>{context.url || t("unknown")}</strong>
        </div>
      </div>
    </details>
  );
}
