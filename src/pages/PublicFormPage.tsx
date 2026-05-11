import {
  useCurrentAccount,
} from "@mysten/dapp-kit";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { BlobLink } from "../components/BlobLink";
import { ContestGuidedFlow } from "../components/ContestGuidedFlow";
import { DynamicField } from "../components/DynamicField";
import { EmptyState } from "../components/EmptyState";
import { SignalMetaChip, SignalMetaRow } from "../components/SignalMetaChip";
import { WalletConnect } from "../components/WalletConnect";
import { parseRealSealEnvelope } from "../crypto/sealPayload";
import { useI18n } from "../i18n";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../lib/encryptionDisplay";
import { getSubmissionCategoryFromPurpose } from "../lib/formTemplates";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import { ensureRespondentSession } from "../lib/respondentSession";
import { getStorageDetailLabels, isLocalFallbackBlob } from "../lib/signalInbox";
import {
  activeSealAdapter,
  createEmptyAnswer,
  normalizeForm,
  saveSubmissionWithEncryption,
  storageAdapter,
} from "../lib/storage";
import { makeId } from "../lib/utils";
import { upsertFormBlobIndex } from "../storage/blobIndex";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import { fetchJsonBlob, readManifest } from "../storage/walrusAdapter";
import type { FormSchema, Submission, SubmissionAttachment } from "../types";

type PublicAnswers = Record<string, unknown>;
type ValidationErrors = Record<string, string>;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export function PublicFormPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { formId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<FormSchema | null>(null);
  const [answers, setAnswers] = useState<PublicAnswers>({});
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");
  const [attachWallet, setAttachWallet] = useState(false);
  const manifestBlobId = searchParams.get("manifest") ?? "";

  useEffect(() => {
    async function load() {
      let nextForm = await storageAdapter.getForm(formId);
      if (!nextForm && manifestBlobId) {
        const manifest = await readManifest(manifestBlobId);
        if (manifest?.formBlobId) {
          const restoredForm = await fetchJsonBlob<FormSchema>(manifest.formBlobId);
          if (restoredForm && restoredForm.id === formId) {
            nextForm = {
              ...restoredForm,
              blobId: manifest.formBlobId,
              manifestBlobId,
            };
            await localStorageAdapter.saveForm(nextForm);
            upsertFormBlobIndex({
              formId: nextForm.id,
              formBlobId: manifest.formBlobId,
              manifestBlobId,
              createdAt: manifest.createdAt,
            });
          }
        }
      }
      setForm(nextForm ? normalizeForm(nextForm) : null);
      if (nextForm) {
        setAnswers(
          Object.fromEntries(nextForm.fields.map((field) => [field.id, createEmptyAnswer(field)])),
        );
      }
      setLoading(false);
    }
    void load();
  }, [formId, manifestBlobId]);

  useEffect(() => {
    if (!account?.address && attachWallet) {
      setAttachWallet(false);
    }
  }, [account?.address, attachWallet]);

  const attachmentFields = useMemo(
    () =>
      new Set(
        form?.fields
          .filter((field) => field.type === "screenshot" || field.type === "video")
          .map((field) => field.id) ?? [],
      ),
    [form],
  );

  const groupedFields = useMemo(() => {
    if (!form) {
      return { sections: [], unsectionedFields: [] };
    }
    return {
      sections: (form.sections ?? []).map((section) => ({
        ...section,
        fields: form.fields.filter((field) => field.sectionId === section.id),
      })),
      unsectionedFields: form.fields.filter((field) => !field.sectionId),
    };
  }, [form]);

  const questionNumbers = useMemo(
    () => new Map(form?.fields.map((field, index) => [field.id, index + 1]) ?? []),
    [form],
  );

  function updateAnswer(fieldId: string, value: unknown) {
    const field = form?.fields.find((candidate) => candidate.id === fieldId);
    let nextValue = value;
    let nextError = "";

    if (field && (field.type === "screenshot" || field.type === "video")) {
      const file = value instanceof File ? value : null;
      const maxBytes = field.type === "screenshot" ? MAX_SCREENSHOT_BYTES : MAX_VIDEO_BYTES;
      if (file && file.size > maxBytes) {
        nextValue = null;
        nextError = t("uploadTooLarge", {
          fieldLabel: field.label,
          maxSize: field.type === "screenshot" ? "5MB" : "25MB",
        });
      }
    }

    setAnswers((current) => ({ ...current, [fieldId]: nextValue }));
    setErrors((current) => ({ ...current, [fieldId]: nextError }));
  }

  function validate(currentForm: FormSchema) {
    const nextErrors: ValidationErrors = {};
    currentForm.fields.forEach((field) => {
      const value = answers[field.id];
      if (!field.required) {
        return;
      }
      const missing =
        value === "" ||
        value === null ||
        value === undefined ||
        (Array.isArray(value) && value.length === 0);
      if (missing) {
        nextErrors[field.id] = t("requiredFieldError");
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form || !validate(form)) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setSubmitNotice("");
    try {
      const signedAt = new Date().toISOString();
      const isAnonymous = !attachWallet || !account?.address;
      const session = await ensureRespondentSession({
        walletAddress: account?.address,
        isAnonymous,
      });
      const respondentMeta = {
        walletAddress: isAnonymous ? undefined : account?.address,
        chain: "sui" as const,
        sessionId: session.sessionId,
        submittedAt: signedAt,
        isAnonymous,
      };
      const attachments: SubmissionAttachment[] = [];
      const plainAnswers: PublicAnswers = {};

      for (const field of form.fields) {
        const value = answers[field.id];
        if (attachmentFields.has(field.id)) {
          const file = value instanceof File ? value : null;
          if (file) {
            const upload = await storageAdapter.uploadFile(file);
            attachments.push({
              fieldId: field.id,
              type: field.type === "video" ? "video" : "image",
              blobId: upload.blobId,
              name: file.name,
              size: file.size,
            });
            plainAnswers[field.id] = file.name;
          } else {
            plainAnswers[field.id] = "";
          }
        } else {
          plainAnswers[field.id] = value;
        }
      }

      const publicPayloadAnswers = Object.fromEntries(
        form.fields
          .filter((field) => !field.sensitive)
          .map((field) => [field.id, plainAnswers[field.id]]),
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

      if (form.encryptSubmissions) {
        const encryptedPayload = await activeSealAdapter.encrypt(
          JSON.stringify({
            answers: submission.answers,
            attachments: submission.attachments,
          }),
          { projectId: form.projectId },
        );
        const parsedEnvelope = parseRealSealEnvelope(encryptedPayload);
        const sealIdentity = parsedEnvelope
          ? `seal:${parsedEnvelope.packageId}:${parsedEnvelope.objectId}`
          : undefined;

        const savedSubmissionDraft = {
          ...submission,
          encryptedPayload,
          sealIdentity,
        } satisfies Submission;

        const result = await saveSubmissionWithEncryption(
          form,
          savedSubmissionDraft,
          undefined,
          storageAdapter,
        );
        const savedSubmission = {
          ...savedSubmissionDraft,
          blobId: result.blobId,
          encryptedBlobId: "encryptedBlobId" in result ? result.encryptedBlobId : undefined,
          receiptBlobId: result.blobId ?? undefined,
        } satisfies Submission;
        setSubmitted(savedSubmission);
      } else {
        const result = await saveSubmissionWithEncryption(form, submission, undefined, storageAdapter);
        const savedSubmission = {
          ...submission,
          blobId: result.blobId,
          receiptBlobId: result.blobId ?? undefined,
        } satisfies Submission;
        setSubmitted(savedSubmission);
      }
      setSubmitNotice(form.projectId ? t("suiRegistrationDeferredNotice") : "");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t("submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="panel">{t("loadingPublicForm")}</div>;
  }

  if (!form) {
    return (
      <EmptyState>
        <h1>{t("emptyFormNotFound")}</h1>
        <p>{t("publicFormMissingBody")}</p>
      </EmptyState>
    );
  }

  if (submitted) {
    const storageLabels = getStorageDetailLabels(submitted.encryptedBlobId ?? submitted.blobId);
    const submittedRespondentMeta = getSubmissionRespondentMeta(submitted);
    const isEncryptedSubmission = Boolean(submitted.isEncrypted);
    return (
      <section className="stack">
        <ContestGuidedFlow
          summary={
            isEncryptedSubmission
              ? "Private signal submitted. Reviewers can now unlock it from the inbox."
              : "Signal submitted. Reviewers can now review it from the inbox."
          }
          steps={[
            { label: "Select Project", status: "complete" },
            { label: "Create Form", status: "complete" },
            { label: "Share Public Link", status: "complete" },
            { label: "Submit Private Signal", status: "current" },
            { label: "Review Inbox", status: "upcoming" },
            { label: "Decrypt with Wallet", status: "upcoming" },
            { label: "Publish Roadmap", status: "upcoming" },
          ]}
        />
        <section className="panel glow-panel success-screen">
          <p className="eyebrow">{t("signalReceived")}</p>
          <h1>{isEncryptedSubmission ? "Private Signal sent" : "Signal sent"}</h1>
          <p className="lede">
            {isEncryptedSubmission
              ? "Only project reviewers can decrypt this message."
              : "Reviewers can open this submission directly from the inbox."}
          </p>
          <p>
            {isLocalFallbackBlob(submitted.encryptedBlobId ?? submitted.blobId)
              ? "Stored locally only"
              : "Trusted storage ready"}
          </p>
          <p>{t("thanksForFeedback")}</p>
          {submitNotice ? <p className="muted">{submitNotice}</p> : null}
          <div className="success-copy">
            {storageLabels.map((label) => (
              <p key={label}>{label}</p>
            ))}
          </div>
          <details className="answer-card public-submit-details">
            <summary>
              <span>
                <p className="eyebrow">Trusted storage</p>
                <h3>Submission details</h3>
              </span>
            </summary>
            <div className="metadata-list">
              {submitted.onchainSignalId !== undefined ? (
                <div className="metadata-row">
                  <span>Signal Receipt</span>
                  <strong>{submitted.onchainSignalId}</strong>
                </div>
              ) : null}
              <SignalMetaRow label="Submission Blob ID" type="blob" value={submitted.blobId}>
                <BlobLink blobId={submitted.blobId} label="Verify on Walrus" />
              </SignalMetaRow>
              {hasDedicatedEncryptedPayloadBlob(submitted) ? (
                <SignalMetaRow
                  label="Private Signal Blob"
                  type="seal"
                  value={submitted.encryptedBlobId}
                >
                  <BlobLink blobId={submitted.encryptedBlobId} label="Verify on Walrus" />
                </SignalMetaRow>
              ) : null}
              {submitted.isEncrypted && !hasDedicatedEncryptedPayloadBlob(submitted) ? (
                <div className="metadata-row">
                  <span>Private Signal</span>
                  <strong>{getEncryptedPayloadAvailabilityLabel(submitted)}</strong>
                </div>
              ) : null}
              <div className="metadata-row">
                <span>Respondent</span>
                <strong>
                  {submittedRespondentMeta.isAnonymous ? "Anonymous respondent" : "Wallet connected"}
                </strong>
              </div>
              {submitted.pendingOnchainRegistration ? (
                <div className="metadata-row">
                  <span>Sui registration</span>
                  <strong>{t("pendingSuiRegistration")}</strong>
                </div>
              ) : null}
              <div className="metadata-row signal-meta-row">
                <span>Attachment Blob IDs</span>
                <div className="stack signal-meta-row-value">
                  {submitted.attachments.length === 0 ? (
                    <strong>Not available</strong>
                  ) : (
                    submitted.attachments.map((attachment, index) => (
                      <div key={attachment.blobId} className="signal-meta-row-value">
                        <span>Attachment {index + 1}</span>
                        <SignalMetaChip type="blob" value={attachment.blobId} />
                        <div className="signal-meta-row-value">
                          <BlobLink blobId={attachment.blobId} label="Verify on Walrus" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </details>
        </section>
      </section>
    );
  }

  return (
    <form className="panel glow-panel public-form" onSubmit={handleSubmit}>
      <ContestGuidedFlow
        summary="Submit a private signal. Wallet connection stays optional."
        steps={[
          { label: "Select Project", status: "complete" },
          { label: "Create Form", status: "complete" },
          { label: "Share Public Link", status: "complete" },
          { label: "Submit Private Signal", status: "current" },
          { label: "Review Inbox", status: "upcoming" },
          { label: "Decrypt with Wallet", status: "upcoming" },
          { label: "Publish Roadmap", status: "upcoming" },
        ]}
      />
      <p className="eyebrow">{t("publicEyebrow")}</p>
      <h1>{form.title}</h1>
      <p className="lede">{form.description || t("publicDefaultBody")}</p>
      {form.encryptSubmissions ? (
        <section className="answer-card public-private-signal-note">
          <p className="eyebrow">Private Signal</p>
          <h3>Private Signal</h3>
          <p className="muted">Only project reviewers can decrypt this message.</p>
        </section>
      ) : null}

      <section className="answer-card public-identity-card">
        <div className="public-identity-topline">
          <div className="public-identity-copy">
            <p className="eyebrow">{t("publicIdentityEyebrow")}</p>
            <h3>{t("publicIdentityTitle")}</h3>
            <p className="muted">{t("publicIdentityBody")}</p>
          </div>
          <div className="public-identity-wallet">
            <WalletConnect />
          </div>
        </div>

        <div className="public-identity-grid">
          <div className="public-identity-mode">
            <span className="public-identity-label">{t("publicSendMode")}</span>
            <label className="public-identity-toggle">
              <input
                type="checkbox"
                checked={attachWallet}
                disabled={!account?.address}
                onChange={(event) => setAttachWallet(event.target.checked)}
              />
              <span>
                <strong>{t("publicWalletAttach")}</strong>
                <small>
                  {account?.address ? t("publicWalletAttachHelp") : t("publicWalletConnectOptional")}
                </small>
              </span>
            </label>
          </div>

          <div className="public-identity-note">
            <span className="public-identity-label">{t("publicCurrentMode")}</span>
            <strong>
              {attachWallet && account?.address ? t("publicModeWallet") : t("publicModeAnonymous")}
            </strong>
            <p className="muted">
              {attachWallet && account?.address
                ? t("publicWalletModeHelpNoSignature")
                : t("publicAnonymousModeHelp")}
            </p>
          </div>
        </div>
      </section>

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
                    hint={
                      field.type === "screenshot"
                        ? t("screenshotHintWithLimit")
                        : field.type === "video"
                          ? t("videoHintWithLimit")
                          : undefined
                    }
                    onChange={(value) => updateAnswer(field.id, value)}
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
            hint={
              field.type === "screenshot"
                ? t("screenshotHintWithLimit")
                : field.type === "video"
                  ? t("videoHintWithLimit")
                  : undefined
            }
            onChange={(value) => updateAnswer(field.id, value)}
          />
        ))}
      </div>
      {submitError ? <p className="error-text">{submitError}</p> : null}
      <div className="public-form-actions">
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting
            ? t("submitting")
            : attachWallet && account?.address
              ? "Submit with wallet"
              : "Submit anonymously"}
        </button>
      </div>
    </form>
  );
}
