import { useCurrentAccount } from "@mysten/dapp-kit";
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
import { SignalSubmissionPipeline } from "../features/public-form/components/SignalSubmissionPipeline";
import { usePublicFormLoader } from "../features/public-form/hooks/usePublicFormLoader";
import { usePublicSubmission } from "../features/public-form/hooks/usePublicSubmission";
import { useI18n } from "../i18n";
import {
  formatResponseDeadline,
  isResponseDeadlinePassed,
  type ResponseDeadlineLabels,
} from "../lib/responseDeadline";
import { DEFAULT_ATTACHMENT_MAX_BYTES, ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES } from "../lib/storage";
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../utils/formLogic";

export function PublicFormPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { formId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [attachWallet, setAttachWallet] = useState(false);
  const [attachWalletTouched, setAttachWalletTouched] = useState(false);
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
    submitPipeline,
    visibleFieldIds,
    updateAnswer,
    handleSubmit,
    restoreDraft,
    discardDraft,
    copyDiagnostics,
  } = usePublicSubmission({
    form,
    initialAnswers,
    accountAddress: account?.address,
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
    if (!account?.address) {
      if (attachWallet) {
        setAttachWallet(false);
      }
      if (attachWalletTouched) {
        setAttachWalletTouched(false);
      }
    }
  }, [account?.address, attachWallet, attachWalletTouched]);

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
    walletRequired || (attachWallet && account?.address)
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
        ? account?.address
          ? t("publicSubmitWithRequiredWallet")
          : t("publicConnectWalletToSubmit")
        : attachWallet && account?.address
        ? t("publicSubmitWithWallet")
        : t("publicSubmitAnonymously");
  const attachmentMaxBytes = form?.encryptSubmissions ? ENCRYPTED_INLINE_ATTACHMENT_MAX_BYTES : DEFAULT_ATTACHMENT_MAX_BYTES;
  const attachmentLimitMb = Math.round(attachmentMaxBytes / (1024 * 1024));
  const attachmentSizeErrorMessage = (maxSizeBytes: number) =>
    t("uploadTooLarge", {
      fieldLabel: "Attachment",
      maxSize: `${Math.round(maxSizeBytes / (1024 * 1024))}MB`,
    });

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
      setAttachWallet(Boolean(account?.address));
      setAttachWalletTouched(Boolean(account?.address));
    }
  }, [account?.address, walletRequired]);

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
                <strong>{loadErrorDetail.manifestBlobId}</strong>
              </div>
            ) : null}
            {loadErrorDetail.formBlobId ? (
              <div className="metadata-row">
                <span>{t("formBlobId")}</span>
                <strong>{loadErrorDetail.formBlobId}</strong>
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

  function focusSubmitButton() {
    const submitButton = document.querySelector<HTMLButtonElement>(".public-form-actions button[type='submit']");
    submitButton?.focus();
  }

  const failureActions =
    failure?.kind === "wallet_disconnected"
      ? [{ key: "reconnect", label: t("reconnectWallet"), onClick: triggerWalletReconnect }]
      : failure?.kind === "registry_failed"
        ? [{ key: "retry", label: t("retryLabel"), onClick: focusSubmitButton }]
        : failure?.retryable
          ? [{ key: "retry", label: t("retryLabel"), onClick: focusSubmitButton }]
          : [];

  return (
    <form className="panel glow-panel public-form" onSubmit={handleSubmit}>
      <FormHeaderImage
        image={form.headerImage}
        logo={form.headerLogo}
        className="public-form-header-image"
        fallbackTitle={form.title}
      />
      <p className="eyebrow">{t("publicEyebrow")}</p>
      <h1>{form.title}</h1>
      <RichTextContent value={form.description ?? ""} className="lede rich-text-content" fallback={t("publicDefaultBody")} />
      <div className="public-form-summary-row">
        <section className={`answer-card public-deadline-card ${deadlinePassed ? "is-expired" : ""}`}>
          <p className="eyebrow">{t("publicResponseWindow")}</p>
          <h3>{deadlineLabel}</h3>
          <p className="muted">
            {deadlinePassed
              ? t("publicDeadlineClosedHelp")
              : t("publicDeadlineActiveHelp")}
          </p>
        </section>
        {form.encryptSubmissions ? (
          <section className="answer-card public-private-signal-note">
            <p className="eyebrow">{t("publicEncryptedInboxEyebrow")}</p>
            <h3>{t("publicPrivateSignalEnabled")}</h3>
            <p className="muted">{t("publicPrivateSignalHelp")}</p>
          </section>
        ) : null}
      </div>

      <PublicIdentityCard
        walletRequired={walletRequired}
        accountAddress={account?.address}
        attachWallet={attachWallet}
        deadlinePassed={deadlinePassed}
        onAttachWalletChange={setAttachWallet}
        onAttachWalletTouched={() => setAttachWalletTouched(true)}
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

      <PublicSubmitReadiness
        submitModeLabel={submitModeLabel}
        storageModeLabel={storageModeLabel}
        labels={{
          deliveryMode: t("publicReadinessDeliveryMode"),
          storageTarget: t("publicReadinessStorageTarget"),
          attachments: t("publicReadinessAttachments"),
          attachmentsHelp: t("publicReadinessAttachmentsHelp"),
        }}
      />

      <SignalSubmissionPipeline pipeline={submitPipeline} visible={submitting || submitPipeline.status === "failed"} />

      {failure ? (
        <CriticalFailurePanel
          failure={failure}
          title={t("submitRecoveryTitle")}
          copyLabel={t("copyDiagnostics")}
          copiedLabel={t("diagnosticsCopied")}
          copied={diagnosticsCopied}
          actions={failureActions}
          onCopyDiagnostics={copyDiagnostics}
        />
      ) : null}
      {submitError ? <p className="error-text">{submitError}</p> : null}
      <div className="public-form-actions">
        <button type="submit" className="primary-button" disabled={submitting || deadlinePassed}>
          {submitButtonLabel}
        </button>
      </div>
    </form>
  );
}
