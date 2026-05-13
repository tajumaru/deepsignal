import { useCurrentAccount } from "@mysten/dapp-kit";
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { UploadDropzoneItem } from "../components/UploadDropzone";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { BlobLink } from "../components/BlobLink";
import { DynamicField } from "../components/DynamicField";
import { EmptyState } from "../components/EmptyState";
import { RichTextContent } from "../components/RichText";
import { SignalMetaChip, SignalMetaRow } from "../components/SignalMetaChip";
import { useI18n } from "../i18n";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../lib/encryptionDisplay";
import { getSubmissionCategoryFromPurpose } from "../lib/formTemplates";
import {
  formatResponseDeadline,
  isResponseDeadlinePassed,
  type ResponseDeadlineLabels,
} from "../lib/responseDeadline";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import { ensureRespondentSession } from "../lib/respondentSession";
import { getStorageDetailLabels, isLocalFallbackBlob } from "../lib/signalInbox";
import {
  createInlineEncryptedAttachment,
  createEmptyAnswer,
  normalizeForm,
  saveSubmissionWithEncryption,
  storageAdapter,
} from "../lib/storage";
import { makeId } from "../lib/utils";
import { upsertFormBlobIndex } from "../storage/blobIndex";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { FormSchema, Submission, SubmissionAttachment } from "../types";
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../utils/formLogic";

const WalletConnect = lazy(() =>
  import("../components/WalletConnect").then((module) => ({ default: module.WalletConnect })),
);

type PublicAnswers = Record<string, unknown>;
type ValidationErrors = Record<string, string>;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const REAL_SEAL_PROJECT_REQUIRED_MESSAGE =
  "Real Seal encrypted submissions require a selected project. Choose a project or turn off Encrypt submissions.";

function getUploadAnswer(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is UploadDropzoneItem => Boolean(item) && typeof item === "object" && "id" in item)
    : [];
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

export function PublicFormPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { formId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<FormSchema | null>(null);
  const [answers, setAnswers] = useState<PublicAnswers>({});
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");
  const [attachWallet, setAttachWallet] = useState(false);
  const [attachWalletTouched, setAttachWalletTouched] = useState(false);
  const manifestBlobId = searchParams.get("manifest") ?? "";

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        let nextForm: FormSchema | null = null;
        if (manifestBlobId) {
          const { fetchJsonBlob, readManifestWithForm } = await import("../storage/walrusAdapter");
          const carrier = await readManifestWithForm(manifestBlobId);
          const manifest = carrier?.manifest ?? null;
          let restoredForm: FormSchema | null = null;
          let restoredFormBlobId = "";

          if (carrier?.form && carrier.form.id === formId) {
            restoredForm = carrier.form;
            restoredFormBlobId = manifestBlobId;
          } else if (manifest?.formBlobId && manifest.formBlobId !== "__bundled_form__") {
            restoredForm = await fetchJsonBlob<FormSchema>(manifest.formBlobId);
            restoredFormBlobId = manifest.formBlobId;
          }

          if (manifest && restoredForm && restoredForm.id === formId) {
            nextForm = {
              ...restoredForm,
              blobId: restoredFormBlobId,
              manifestBlobId,
            };
            await localStorageAdapter.saveForm(nextForm);
            upsertFormBlobIndex({
              formId: nextForm.id,
              formBlobId: restoredFormBlobId,
              manifestBlobId,
              createdAt: manifest.createdAt,
            });
          }
        }

        if (!nextForm) {
          nextForm = await storageAdapter.getForm(formId);
        }

        setForm(nextForm ? normalizeForm(nextForm) : null);
        if (nextForm) {
          setAnswers(
            Object.fromEntries(nextForm.fields.map((field) => [field.id, createEmptyAnswer(field)])),
          );
        }
      } catch (error) {
        const details = error instanceof Error ? error.message : t("publicFormMissingBody");
        setForm(null);
        setAnswers({});
        setLoadError(
          manifestBlobId
            ? `This shared form could not be restored from Walrus. ${details} Ask the creator to republish until Walrus storage succeeds, then open the new shared link.`
            : `This form is not available in this browser yet. ${details}`,
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [formId, manifestBlobId, t]);

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

  const visibleFieldIds = useMemo(
    () => (form ? getVisibleFieldIds(form.fields, answers) : new Set<string>()),
    [answers, form],
  );

  const questionNumbers = useMemo(() => {
    const visibleFields = form ? getOrderedFields(form.fields).filter((field) => visibleFieldIds.has(field.id)) : [];
    return new Map(visibleFields.map((field, index) => [field.id, index + 1]));
  }, [form, visibleFieldIds]);
  const deadlinePassed = useMemo(() => isResponseDeadlinePassed(form?.responseDeadline), [form?.responseDeadline]);
  const walletRequired = form?.identityPolicy === "wallet_required";
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
      ? "Wallet attached, no extra personal-message signature"
      : "Anonymous signal";
  const storageModeLabel = form?.encryptSubmissions ? "Walrus with optional Seal encryption" : "Walrus or local fallback";

  useEffect(() => {
    if (walletRequired) {
      setAttachWallet(Boolean(account?.address));
      setAttachWalletTouched(Boolean(account?.address));
    }
  }, [account?.address, walletRequired]);

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
        return;
      }
      const missing =
        value === "" ||
        value === null ||
        value === undefined ||
        (Array.isArray(value) && value.length === 0) ||
        (attachmentFields.has(field.id) &&
          uploadItems.filter((attachment) => attachment.status !== "failed").length === 0);
      if (missing) {
        nextErrors[field.id] = t("requiredFieldError");
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
    if (walletRequired && !account?.address) {
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
    try {
      const signedAt = new Date().toISOString();
      const isAnonymous = walletRequired ? false : !attachWallet || !account?.address;
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
                const inlineAttachment = await createInlineEncryptedAttachment(file);
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

      const result = await saveSubmissionWithEncryption(form, submission, undefined, storageAdapter, {
        responseDeadlinePassed: t("formResponseClosed"),
      });
      const savedSubmission = {
        ...submission,
        isEncrypted: Boolean(form.encryptSubmissions),
        blobId: result.blobId,
        encryptedBlobId: "encryptedBlobId" in result ? result.encryptedBlobId : undefined,
        encryptedPayload: "encryptedPayload" in result ? result.encryptedPayload : undefined,
        sealIdentity: "sealIdentity" in result ? result.sealIdentity : undefined,
        receiptBlobId: result.blobId ?? undefined,
      } satisfies Submission;
      setSubmitted(savedSubmission);
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
        <p>{loadError || t("publicFormMissingBody")}</p>
      </EmptyState>
    );
  }

  if (submitted) {
    const storageLabels = getStorageDetailLabels(submitted.encryptedBlobId ?? submitted.blobId);
    const submittedRespondentMeta = getSubmissionRespondentMeta(submitted);
    const isEncryptedSubmission = Boolean(submitted.isEncrypted);
    return (
      <section className="stack">
        <section className="panel glow-panel success-screen">
          <p className="eyebrow">{t("signalReceived")}</p>
          <h1>{isEncryptedSubmission ? "Private signal sent" : "Signal sent"}</h1>
          <p className="lede">
            {isEncryptedSubmission
              ? "Only authorized reviewers can unlock this message inside the encrypted feedback inbox."
              : "Reviewers can open this submission directly from the inbox."}
          </p>
          <p>{isLocalFallbackBlob(submitted.encryptedBlobId ?? submitted.blobId) ? "Stored locally only" : "Trusted storage ready"}</p>
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
                <SignalMetaRow label="Private Signal Blob" type="seal" value={submitted.encryptedBlobId}>
                  <BlobLink blobId={submitted.encryptedBlobId} label="Verify on Walrus" />
                </SignalMetaRow>
              ) : null}
              {submitted.isEncrypted && !hasDedicatedEncryptedPayloadBlob(submitted) ? (
                <div className="metadata-row">
                  <span>Private Signal</span>
                  <strong>{getEncryptedPayloadAvailabilityLabel(submitted)}</strong>
                </div>
              ) : null}
              <SignalMetaRow label="Seal Identity" type="seal" value={submitted.sealIdentity} emptyLabel={t("notAvailable")} />
              <div className="metadata-row">
                <span>Respondent</span>
                <strong>{submittedRespondentMeta.isAnonymous ? "Anonymous respondent" : "Wallet attached"}</strong>
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
                        {attachment.storage === "inline" ? (
                          <strong>Embedded in private signal</strong>
                        ) : (
                          <>
                            <SignalMetaChip type="blob" value={attachment.blobId} />
                            <div className="signal-meta-row-value">
                              <BlobLink blobId={attachment.blobId} label="Verify on Walrus" />
                            </div>
                          </>
                        )}
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
      <p className="eyebrow">{t("publicEyebrow")}</p>
      <h1>{form.title}</h1>
      <RichTextContent value={form.description ?? ""} className="lede rich-text-content" fallback={t("publicDefaultBody")} />
      <section className={`answer-card public-deadline-card ${deadlinePassed ? "is-expired" : ""}`}>
        <p className="eyebrow">Response window</p>
        <h3>{deadlineLabel}</h3>
        <p className="muted">
          {deadlinePassed
            ? "This intake is closed. Reviewers can still inspect signals already stored in the inbox."
            : "Send your signal before the deadline to keep it in the active review queue."}
        </p>
      </section>
      {form.encryptSubmissions ? (
        <section className="answer-card public-private-signal-note">
          <p className="eyebrow">Encrypted Feedback Inbox</p>
          <h3>Private signal enabled</h3>
          <p className="muted">Your message stays private until an authorized reviewer unlocks it.</p>
        </section>
      ) : null}

      <section className="answer-card public-identity-card">
        <div className="public-identity-topline">
          <div className="public-identity-copy">
            <p className="eyebrow">{t("publicIdentityEyebrow")}</p>
            <h3>{t("publicIdentityTitle")}</h3>
            <p className="muted">{t(walletRequired ? "publicIdentityBodyWalletRequired" : "publicIdentityBody")}</p>
          </div>
          <div className="public-identity-wallet">
            <Suspense fallback={<div className="wallet-connect-shell wallet-connect-shell-compact" />}>
              <WalletConnect compact />
            </Suspense>
          </div>
        </div>

        <div className="public-identity-grid">
          <div className="public-identity-mode">
            <span className="public-identity-label">{t("publicSendMode")}</span>
            <label className="public-identity-toggle">
              <input
                type="checkbox"
                checked={attachWallet}
                disabled={walletRequired || !account?.address || deadlinePassed}
                onChange={(event) => {
                  setAttachWalletTouched(true);
                  setAttachWallet(event.target.checked);
                }}
              />
              <span>
                <strong>{walletRequired ? t("publicWalletRequired") : t("publicWalletAttach")}</strong>
                <small>
                  {walletRequired
                    ? account?.address
                      ? t("publicWalletRequiredConnectedHelp")
                      : t("publicWalletRequiredHelp")
                    : account?.address
                      ? t("publicWalletAttachHelp")
                      : t("publicWalletConnectOptional")}
                </small>
              </span>
            </label>
          </div>

          <div className="public-identity-note">
            <span className="public-identity-label">{t("publicCurrentMode")}</span>
            <strong>{walletRequired || (attachWallet && account?.address) ? t("publicModeWallet") : t("publicModeAnonymous")}</strong>
            <p className="muted">
              {walletRequired
                ? account?.address
                  ? t("publicWalletRequiredConnectedHelp")
                  : t("publicWalletRequiredHelp")
                : attachWallet && account?.address
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
                    required={isFieldRequired(field, form.fields, answers, true)}
                    hint={
                      field.type === "screenshot"
                        ? `${t("screenshotHint")} Max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB per file.`
                        : field.type === "video"
                          ? `${t("videoHint")} Max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB per file.`
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
                ? `${t("screenshotHint")} Max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB per file.`
                : field.type === "video"
                  ? `${t("videoHint")} Max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB per file.`
                  : undefined
            }
            onChange={(value) => updateAnswer(field.id, value)}
            disabled={deadlinePassed}
          />
        ))}
      </div>

      <section className="answer-card public-submit-readiness">
        <div className="metadata-list">
          <div className="metadata-row">
            <span>Delivery mode</span>
            <strong>{submitModeLabel}</strong>
          </div>
          <div className="metadata-row">
            <span>Storage target</span>
            <strong>{storageModeLabel}</strong>
          </div>
          <div className="metadata-row">
            <span>Attachments</span>
            <strong>Preview before submit. Failed uploads stay visible until you remove or replace them.</strong>
          </div>
        </div>
      </section>

      {submitError ? <p className="error-text">{submitError}</p> : null}
      <div className="public-form-actions">
        <button type="submit" className="primary-button" disabled={submitting || deadlinePassed}>
          {deadlinePassed
            ? "Submission closed"
            : submitting
              ? t("submitting")
              : walletRequired
                ? account?.address
                  ? t("publicSubmitWithRequiredWallet")
                  : t("publicConnectWalletToSubmit")
                : attachWallet && account?.address
                ? "Submit with wallet"
                : "Submit anonymously"}
        </button>
      </div>
    </form>
  );
}
