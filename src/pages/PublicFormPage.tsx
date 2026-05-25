import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { DynamicField } from "../components/DynamicField";
import { EmptyState } from "../components/EmptyState";
import { FormHeaderImage } from "../components/FormHeaderImage";
import { RichTextContent } from "../components/RichText";
import { CriticalFailurePanel } from "../components/CriticalFailurePanel";
import { RecoverableDraftBanner } from "../components/RecoverableDraftBanner";
import { WalletSurface } from "../components/WalletSurface";
import { WalrusRuntimeSurface } from "../components/WalrusRuntimeSurface";
import { PublicWalletAccountPanel } from "../features/public-form/components/PublicWalletAccountPanel";
import { PublicFormSuccess } from "../features/public-form/components/PublicFormSuccess";
import { PublicSubmitReadiness } from "../features/public-form/components/PublicSubmitReadiness";
import { SignalMetaChip } from "../components/SignalMetaChip";
import { SignalSubmissionPipeline } from "../features/public-form/components/SignalSubmissionPipeline";
import { usePublicFormLoader } from "../features/public-form/hooks/usePublicFormLoader";
import { usePublicSubmission, type SignalPipelineStage } from "../features/public-form/hooks/usePublicSubmission";
import { useI18n } from "../i18n";
import {
  formatResponseDeadline,
  isResponseDeadlinePassed,
  type ResponseDeadlineLabels,
} from "../lib/responseDeadline";
import { DEFAULT_ATTACHMENT_MAX_BYTES, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES } from "../lib/attachmentLimits";
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../utils/formLogic";
import { isAttachmentFieldType, isConfirmationCheckboxField } from "../lib/fieldTypes";
import { collectSignalContext, type AttachedSignalContext } from "../lib/signalContext";
import type { FieldType } from "../types";

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
  const [resolvedWalletAddress, setResolvedWalletAddress] = useState<string | undefined>(undefined);
  const [walletProvider, setWalletProvider] = useState<string | undefined>(undefined);
  const manifestBlobId = searchParams.get("manifest") ?? "";
  const { form, initialAnswers, loading, loadError, loadErrorDetail } = usePublicFormLoader({
    formId,
    manifestBlobId,
    missingFormMessage: t("publicFormMissingBody"),
  });
  const walletRequired = form?.identityPolicy === "wallet_required";
  const hasSingleAnswerMode = walletRequired;
  const walletModeSelected = walletRequired || answerAuthMode === "sui_wallet";
  const attachWallet = walletModeSelected;
  const walletFallback = <div className="wallet-connect-shell wallet-connect-shell-compact" />;
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
    zkLoginSession: null,
    identityMode: walletModeSelected ? "wallet" : "anonymous",
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
  });

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
  const deadlinePassed = useMemo(() => isResponseDeadlinePassed(form?.responseDeadline), [form?.responseDeadline]);
  const deadlineLabel = useMemo(() => {
    const responseDeadlineLabels: ResponseDeadlineLabels = {
      noLimit: t("responseDeadlineNone"),
      closed: t("responseDeadlineClosed"),
      hoursLeft: (hours) => t("responseDeadlineHoursLeft", { count: hours }),
      daysLeft: (days) => t("responseDeadlineDaysLeft", { count: days }),
    };
    return formatResponseDeadline(form?.responseDeadline, responseDeadlineLabels);
  }, [form?.responseDeadline, t]);
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
  const storageModeLabel = form?.encryptSubmissions
    ? "Evidence layer active"
    : "Protected review delivery";
  const submitButtonLabel = deadlinePassed
    ? t("publicSubmissionClosed")
    : submitting
      ? "Submitting secure report..."
    : walletRequired
        ? resolvedWalletAddress
          ? "Submit Secure Report"
          : "Connect wallet to submit secure report"
        : attachWallet && resolvedWalletAddress
        ? "Submit Secure Report"
        : "Submit Secure Report";
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
      preparing_signal: t("publicSubmissionStagePreparing"),
      encrypting: t("publicSubmissionStageEncrypting"),
      uploading_to_walrus: t("publicSubmissionStageUploading"),
      confirming_blob: t("publicSubmissionStageConfirming"),
      generating_manifest: t("publicSubmissionStageManifest"),
      signal_secured: t("publicSubmissionStageSecured"),
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
      ? `${requiredProgress.completed} of ${requiredProgress.total} completed`
      : "Ready when you are";
  const remainingEstimate =
    requiredProgress.missing > 1
      ? `~${Math.min(3, Math.max(1, Math.ceil(requiredProgress.missing / 2)))} min remaining`
      : requiredProgress.missing === 1
        ? "~1 min remaining"
        : "Ready to send";
  const visibleErrorCount = useMemo(
    () => Object.entries(errors).filter(([fieldId, message]) => visibleFieldIds.has(fieldId) && Boolean(message)).length,
    [errors, visibleFieldIds],
  );
  const submitReadinessLabel = deadlinePassed
    ? t("publicSubmitBarClosed")
    : storageConnectionPreparing
      ? "Storage connection is still preparing."
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

  function handleChangeAuthMethod() {
    if (hasSingleAnswerMode) {
      return;
    }
    triggerHaptic(10);
    setPublicStep("identity");
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
                <SignalMetaChip type="manifest" value={loadErrorDetail.manifestBlobId} />
              </div>
            ) : null}
            {loadErrorDetail.formBlobId ? (
              <div className="metadata-row">
                <span>{t("formBlobId")}</span>
                <SignalMetaChip type="blob" value={loadErrorDetail.formBlobId} />
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
                <span className="signal-capsule-action-icon" aria-hidden="true">◎</span>
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
            <div className="public-identity-choice-wallet-shell">
              <WalletSurface fallback={walletFallback}>
                <WalrusRuntimeSurface fallback={walletFallback}>
                  <PublicWalletAccountPanel
                    onAccountAddressChange={(address) => setResolvedWalletAddress(address)}
                    onWalletProviderChange={(provider) => setWalletProvider(provider)}
                  />
                </WalrusRuntimeSurface>
              </WalletSurface>
            </div>
            <button
              type="button"
              className="primary-button signal-capsule-action is-wallet"
              onClick={handleSelectWalletAndContinue}
              disabled={!resolvedWalletAddress}
            >
              <span className="signal-capsule-action-icon" aria-hidden="true">◉</span>
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

  if (submitted) {
    return (
      <PublicFormSuccess
        submitted={submitted}
        submitNotice={submitNotice}
        notAvailableLabel={t("notAvailable")}
        pendingSuiRegistrationLabel={t("pendingSuiRegistration")}
        signalReceivedLabel={t("signalReceived")}
        thanksForFeedbackLabel={t("thanksForFeedback")}
      />
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

  return (
    <form className="panel glow-panel public-form" onSubmit={handleSubmit}>
      {walletModeSelected ? (
        <WalrusRuntimeSurface fallback={null}>
          <div aria-hidden="true" style={{ display: "none" }} />
        </WalrusRuntimeSurface>
      ) : null}
      <FormHeaderImage
        image={form.headerImage}
        logo={form.headerLogo}
        className="public-form-header-image"
        fallbackTitle={form.title}
      />
      <section className={`public-trust-header ${deadlinePassed ? "is-expired" : ""}`} aria-label={t("publicFormStatusSummary")}>
        <div className="public-trust-copy">
          <p className="eyebrow">Secure reporting workflow</p>
          <h1>{form.title}</h1>
          <RichTextContent value={form.description ?? ""} className="lede rich-text-content" fallback={t("publicDefaultBody")} />
        </div>
        <div className="public-trust-list" role="list">
          <span role="listitem">Anonymous or verified submissions</span>
          <span role="listitem">{form.encryptSubmissions ? "Encrypted before upload" : "Protected reviewer workflow"}</span>
          <span role="listitem">{form.encryptSubmissions ? "Only authorized reviewers can unlock evidence" : "Selected reviewers can inspect submissions"}</span>
          <span role="listitem">{walletRequired ? "Wallet verification required" : "Wallet verification optional"}</span>
        </div>
        <div className="public-trust-footer">
          <div className="public-form-status-badges">
            <span className={`public-form-status-badge ${deadlinePassed ? "is-expired" : "is-live"}`}>
              <span>{t("publicResponseWindow")}</span>
              <strong>{deadlinePassed ? t("publicDeadlineClosedBadge") : deadlineLabel}</strong>
            </span>
            <span className="public-form-status-badge is-private">
              <span>Evidence layer</span>
              <strong>{form.encryptSubmissions ? "Seal + Walrus active" : "Protected review mode"}</strong>
            </span>
          </div>
          <p className="muted">
            {deadlinePassed
              ? t("publicDeadlineClosedHelp")
              : form.encryptSubmissions
                ? "This workflow creates a secure report with verifiable storage metadata."
                : "This workflow stays public-facing while preserving review controls."}
          </p>
        </div>
      </section>
      <div className="public-form-status-strip">
        <section className="answer-card public-submit-readiness-inline">
          <div className="public-submit-badge-grid">
            <span className={`public-submit-badge is-${walletModeSelected ? "wallet" : "anonymous"}`}>
              <span className="public-submit-badge-icon" aria-hidden="true">
                {walletModeSelected ? "Sui" : "Anon"}
              </span>
              <span>
                <small>{t("publicIdentityBadgeLabel")}</small>
                <strong>{walletModeSelected ? t("publicIdentityBadgeWallet") : t("publicIdentityBadgeGuest")}</strong>
              </span>
            </span>
          </div>
          {!hasSingleAnswerMode ? (
            <div className="inline-actions">
              <button type="button" className="ghost-button" onClick={handleChangeAuthMethod}>
                {t("publicIdentityChangeAction")}
              </button>
            </div>
          ) : null}
        </section>
        <PublicSubmitReadiness
          className="public-submit-readiness-inline"
          identityMode={walletModeSelected ? "wallet" : "anonymous"}
          sealEnabled={Boolean(form.encryptSubmissions)}
          submitModeLabel={submitModeLabel}
          storageModeLabel={storageModeLabel}
          labels={{
            summary: t("publicReadinessSummary"),
            deliveryMode: t("publicReadinessDeliveryMode"),
            anonymous: t("publicReadinessAnonymous"),
            suiWallet: t("publicReadinessSuiWallet"),
            zkLogin: t("publicZkLoginProvider"),
            storageTarget: t("publicReadinessStorageTarget"),
            walrus: t("publicReadinessWalrus"),
            walrusIcon: t("publicReadinessWalrusIcon"),
            seal: t("publicReadinessSeal"),
            sealOn: t("publicReadinessSealOn"),
            sealOff: t("publicReadinessSealOff"),
            attachments: t("publicReadinessAttachments"),
            attachmentsHelp: t("publicReadinessAttachmentsHelp"),
          }}
        />
      </div>

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
                  disabled={deadlinePassed || locationState === "requesting"}
                >
                  <span className="signal-capsule-action-icon" aria-hidden="true">
                    {location ? "◎" : "⌖"}
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
                    disabled={deadlinePassed || locationState === "requesting"}
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
                    disabled={deadlinePassed}
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
            disabled={deadlinePassed}
          />
        ))}
      </div>

      <AttachedSignalContextPanel context={attachedContext} />

      <SignalSubmissionPipeline
        pipeline={submitPipeline}
        visible={submitting || (submitPipeline.status === "failed" && !submissionOverlayDismissed)}
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
      {submitError && !failure ? <p className="error-text">{submitError}</p> : null}
      <div className="public-form-actions">
        <div className="public-submit-bar-copy" aria-live="polite">
          <span>{submitReadinessLabel}</span>
          <strong>{submitModeLabel}</strong>
        </div>
        <button
          type="submit"
          className="primary-button signal-capsule-action signal-capsule-action-submit"
          disabled={submitting || deadlinePassed}
          onClick={() => triggerHaptic([12, 22, 16])}
        >
          <span className="signal-capsule-action-icon" aria-hidden="true">
            {submitting ? "◌" : "⬢"}
          </span>
          <span className="signal-capsule-action-copy">
            <strong>{submitButtonLabel}</strong>
            <small>{submitting ? "Encrypting and transmitting signal" : "Touch to transmit through the active secure route"}</small>
          </span>
        </button>
      </div>
    </form>
  );
}

function AttachedSignalContextPanel({ context }: { context: AttachedSignalContext }) {
  const compactRows = [
    ["Device", `${context.device.type} / ${context.os}`],
    ["Browser", `${context.browser} ${context.browserVersion}`],
    ["Viewport", `${context.viewport.width} x ${context.viewport.height} @${context.dpr}x`],
    ["Page", context.pageName],
    ["Wallet", context.wallet.connected ? `${context.wallet.provider ?? "Wallet"} ${context.wallet.address ?? ""}` : "Not connected"],
    ["Network", context.chain],
    ["Locale", `${context.locale} / ${context.timezone}`],
  ];
  const capturedIssueCount = context.consoleErrors.length + context.networkErrors.length;

  return (
    <details className="attached-signal-context">
      <summary>
        <span>
          <strong>Attached Signal Context</strong>
          <small>Device, page, wallet mode, and recent errors are attached automatically.</small>
        </span>
        <span className="attached-signal-context-count">
          {capturedIssueCount > 0 ? `${capturedIssueCount} recent issue${capturedIssueCount === 1 ? "" : "s"}` : "Auto-attached"}
        </span>
      </summary>
      <div className="attached-signal-context-grid">
        {compactRows.map(([label, value]) => (
          <div key={label} className="metadata-row">
            <span>{label}</span>
            <strong>{value || "unknown"}</strong>
          </div>
        ))}
        <div className="metadata-row">
          <span>URL</span>
          <strong>{context.url || "unknown"}</strong>
        </div>
      </div>
    </details>
  );
}
