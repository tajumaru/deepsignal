import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { DynamicField } from "../components/DynamicField";
import { EmptyState } from "../components/EmptyState";
import { FormHeaderImage } from "../components/FormHeaderImage";
import { RichTextContent } from "../components/RichText";
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
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../utils/formLogic";

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function PublicFormPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { formId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [attachWallet, setAttachWallet] = useState(false);
  const [attachWalletTouched, setAttachWalletTouched] = useState(false);
  const manifestBlobId = searchParams.get("manifest") ?? "";
  const { form, initialAnswers, loading, loadError } = usePublicFormLoader({
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
    submitPipeline,
    visibleFieldIds,
    updateAnswer,
    handleSubmit,
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
    return (
      <EmptyState>
        <h1>{t("emptyFormNotFound")}</h1>
        <p>{loadError || t("publicFormMissingBody")}</p>
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
                    questionNumber={questionNumbers.get(field.id)}
                    required={isFieldRequired(field, form.fields, answers, true)}
                    hint={
                      field.type === "screenshot"
                        ? t("attachmentMaxFileSize", {
                            hint: t("screenshotHint"),
                            size: Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024)),
                          })
                        : field.type === "video"
                          ? t("attachmentMaxFileSize", {
                              hint: t("videoHint"),
                              size: Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024)),
                            })
                          : undefined
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
            questionNumber={questionNumbers.get(field.id)}
            required={isFieldRequired(field, form.fields, answers, true)}
            hint={
              field.type === "screenshot"
                ? t("attachmentMaxFileSize", {
                    hint: t("screenshotHint"),
                    size: Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024)),
                  })
                : field.type === "video"
                  ? t("attachmentMaxFileSize", {
                      hint: t("videoHint"),
                      size: Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024)),
                    })
                  : undefined
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

      {submitError ? <p className="error-text">{submitError}</p> : null}
      <div className="public-form-actions">
        <button type="submit" className="primary-button" disabled={submitting || deadlinePassed}>
          {submitButtonLabel}
        </button>
      </div>
    </form>
  );
}
