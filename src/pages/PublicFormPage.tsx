import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { DynamicField } from "../components/DynamicField";
import { EmptyState } from "../components/EmptyState";
import { FormHeaderImage } from "../components/FormHeaderImage";
import { RichTextContent } from "../components/RichText";
import { CriticalFailurePanel } from "../components/CriticalFailurePanel";
import { RecoverableDraftBanner } from "../components/RecoverableDraftBanner";
import { PublicFormSuccess } from "../features/public-form/components/PublicFormSuccess";
import { PublicIdentityCard } from "../features/public-form/components/PublicIdentityCard";
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
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}

export function PublicFormPage() {
  const { t } = useI18n();
  const { formId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [walletAccountAddress, setWalletAccountAddress] = useState<string | undefined>();
  const [walletProvider, setWalletProvider] = useState<string | undefined>();
  const [attachWallet, setAttachWallet] = useState(false);
  const [attachWalletTouched, setAttachWalletTouched] = useState(false);
  const [submissionOverlayDismissed, setSubmissionOverlayDismissed] = useState(false);
  const manifestBlobId = searchParams.get("manifest") ?? "";
  const { form, initialAnswers, loading, loadError, loadErrorDetail } = usePublicFormLoader({
    formId,
    manifestBlobId,
    missingFormMessage: t("publicFormMissingBody"),
  });
  const walletRequired = form?.identityPolicy === "wallet_required";
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
    storageConnectionPreparing,
    visibleFieldIds,
    updateAnswer,
    handleSubmit,
    restoreDraft,
    discardDraft,
    discardRecovery,
    copyDiagnostics,
  } = usePublicSubmission({
    form,
    initialAnswers,
    accountAddress: walletAccountAddress,
    walletProvider,
    attachWallet,
    walletRequired,
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
  });

  useEffect(() => {
    if (!walletAccountAddress) {
      if (attachWallet) {
        setAttachWallet(false);
      }
      if (attachWalletTouched) {
        setAttachWalletTouched(false);
      }
    }
  }, [walletAccountAddress, attachWallet, attachWalletTouched]);

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
    walletRequired || (attachWallet && walletAccountAddress)
      ? t("publicSubmitModeWalletAttached")
      : t("publicSubmitModeAnonymous");
  const storageModeLabel = form?.encryptSubmissions
    ? t("publicStorageModeEncrypted")
    : t("publicStorageModePlain");
  const submitButtonLabel = deadlinePassed
    ? t("publicSubmissionClosed")
    : submitting
      ? t("publicSubmittingSecure")
    : walletRequired
        ? walletAccountAddress
          ? t("publicSubmitWithRequiredWallet")
          : t("publicConnectWalletToSubmit")
        : attachWallet && walletAccountAddress
        ? t("publicSubmitWithWallet")
        : t("publicSubmitAnonymously");
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
    collectSignalContext({ form: null, manifestBlobId, walletAddress: walletAccountAddress, walletProvider }),
  );

  useEffect(() => {
    function updateAttachedContext() {
      setAttachedContext(collectSignalContext({ form, manifestBlobId, walletAddress: walletAccountAddress, walletProvider }));
    }
    updateAttachedContext();
    window.addEventListener("resize", updateAttachedContext);
    return () => window.removeEventListener("resize", updateAttachedContext);
  }, [form, manifestBlobId, walletAccountAddress, walletProvider]);

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

  useEffect(() => {
    if (walletRequired) {
      setAttachWallet(Boolean(walletAccountAddress));
      setAttachWalletTouched(Boolean(walletAccountAddress));
    }
  }, [walletAccountAddress, walletRequired]);

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
            <div className="metadata-row">
              <span>{t("retryGuidance")}</span>
              <strong>{retryGuidance || loadErrorDetail.guidance}</strong>
            </div>
          </div>
        ) : null}
      </EmptyState>
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
    const walletButton = document.querySelector<HTMLButtonElement>(".public-identity-wallet button");
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
      <FormHeaderImage
        image={form.headerImage}
        logo={form.headerLogo}
        className="public-form-header-image"
        fallbackTitle={form.title}
      />
      <section className={`public-trust-header ${deadlinePassed ? "is-expired" : ""}`} aria-label={t("publicFormStatusSummary")}>
        <div className="public-trust-copy">
          <p className="eyebrow">{t("publicEyebrow")}</p>
          <h1>{form.title}</h1>
          <RichTextContent value={form.description ?? ""} className="lede rich-text-content" fallback={t("publicDefaultBody")} />
        </div>
        <div className="public-trust-list" role="list">
          <span role="listitem">{t("publicTrustPrivateDefault")}</span>
          <span role="listitem">
            {form.encryptSubmissions ? t("publicTrustEncryptedBeforeUpload") : t("publicTrustProtectedReview")}
          </span>
          <span role="listitem">
            {form.encryptSubmissions ? t("publicTrustSelectedUnlock") : t("publicTrustSelectedReview")}
          </span>
          <span role="listitem">{walletRequired ? t("publicTrustWalletRequired") : t("publicTrustWalletOptional")}</span>
        </div>
        <div className="public-trust-footer">
          <div className="public-form-status-badges">
            <span className={`public-form-status-badge ${deadlinePassed ? "is-expired" : "is-live"}`}>
              <span>{t("publicResponseWindow")}</span>
              <strong>{deadlinePassed ? t("publicDeadlineClosedBadge") : deadlineLabel}</strong>
            </span>
            <span className="public-form-status-badge is-private">
              <span>{t("publicEncryptedInboxEyebrow")}</span>
              <strong>{form.encryptSubmissions ? t("publicPrivateSignalBadge") : t("publicTrustProtectedBadge")}</strong>
            </span>
          </div>
          <p className="muted">
            {deadlinePassed
              ? t("publicDeadlineClosedHelp")
              : form.encryptSubmissions
                ? t("publicPrivateSignalBadgeHelp")
                : t("publicDeadlineActiveHelp")}
          </p>
        </div>
      </section>
      <div className="public-form-status-strip">
        <PublicSubmitReadiness
          className="public-submit-readiness-inline"
          identityMode={walletRequired || (attachWallet && walletAccountAddress) ? "wallet" : "anonymous"}
          sealEnabled={Boolean(form.encryptSubmissions)}
          submitModeLabel={submitModeLabel}
          storageModeLabel={storageModeLabel}
          labels={{
            summary: t("publicReadinessSummary"),
            deliveryMode: t("publicReadinessDeliveryMode"),
            anonymous: t("publicReadinessAnonymous"),
            suiWallet: t("publicReadinessSuiWallet"),
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

      <PublicIdentityCard
        walletRequired={walletRequired}
        accountAddress={walletAccountAddress}
        attachWallet={attachWallet}
        deadlinePassed={deadlinePassed}
        onAttachWalletChange={setAttachWallet}
        onAttachWalletTouched={() => setAttachWalletTouched(true)}
        onAccountAddressChange={setWalletAccountAddress}
        onWalletProviderChange={setWalletProvider}
        labels={{
          eyebrow: t("publicIdentityEyebrow"),
          title: t("publicIdentityTitle"),
          body: t(walletRequired ? "publicIdentityBodyWalletRequired" : "publicIdentityBody"),
          sendMode: t("publicSendMode"),
          walletRequired: t("publicWalletRequired"),
          walletAttach: t("publicWalletAttach"),
          walletRequiredConnectedHelp: t("publicWalletRequiredConnectedHelp"),
          walletRequiredHelp: t("publicWalletRequiredHelp"),
          walletAttachHelp: t("publicWalletAttachHelp"),
          walletConnectOptional: t("publicWalletConnectOptional"),
          currentMode: t("publicCurrentMode"),
          modeWallet: t("publicModeWallet"),
          modeAnonymous: t("publicModeAnonymous"),
          walletModeHelpNoSignature: t("publicWalletModeHelpNoSignature"),
          anonymousModeHelp: t("publicAnonymousModeHelp"),
        }}
      />

      {hasRecoverableDraft ? (
        <RecoverableDraftBanner
          title={t("recoverableDraftTitle")}
          description={
            form.fields.some((field) => field.type === "screenshot" || field.type === "video")
              ? "Attachment drafts are not restored. Re-add screenshots or videos before sending."
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
        <button type="submit" className="primary-button" disabled={submitting || deadlinePassed || storageConnectionPreparing}>
          {submitButtonLabel}
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
