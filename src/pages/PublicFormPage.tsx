import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { BlobLink } from "../components/BlobLink";
import { DynamicField } from "../components/DynamicField";
import { EmptyState } from "../components/EmptyState";
import { Link } from "react-router-dom";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useI18n } from "../i18n";
import { createEmptyAnswer, saveSubmissionWithEncryption, storageAdapter } from "../lib/storage";
import { makeId } from "../lib/utils";
import type { FormSchema, Submission, SubmissionAttachment } from "../types";

type PublicAnswers = Record<string, unknown>;
type ValidationErrors = Record<string, string>;

export function PublicFormPage() {
  const { t } = useI18n();
  const { formId = "" } = useParams();
  const sealRuntime = getSealRuntimeStatus();
  const [form, setForm] = useState<FormSchema | null>(null);
  const [answers, setAnswers] = useState<PublicAnswers>({});
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Submission | null>(null);

  useEffect(() => {
    async function load() {
      const nextForm = await storageAdapter.getForm(formId);
      setForm(nextForm);
      if (nextForm) {
        setAnswers(
          Object.fromEntries(nextForm.fields.map((field) => [field.id, createEmptyAnswer(field)])),
        );
      }
      setLoading(false);
    }
    void load();
  }, [formId]);

  const attachmentFields = useMemo(
    () =>
      new Set(
        form?.fields
          .filter((field) => field.type === "screenshot" || field.type === "video")
          .map((field) => field.id) ?? [],
      ),
    [form],
  );

  function updateAnswer(fieldId: string, value: unknown) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => ({ ...current, [fieldId]: "" }));
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
    try {
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

      const submission: Submission = {
        id: makeId("submission"),
        formId: form.id,
        answers: plainAnswers,
        attachments,
        status: "unread",
        priority: "medium",
        tags: [],
        notes: "",
        isEncrypted: Boolean(form.encryptSubmissions),
        createdAt: new Date().toISOString(),
      };

      const result = await saveSubmissionWithEncryption(form, submission);
      setSubmitted({
        ...submission,
        blobId: result.blobId,
        encryptedBlobId: "encryptedBlobId" in result ? result.encryptedBlobId : undefined,
      });
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
    return (
      <section className="panel glow-panel success-screen">
        <p className="eyebrow">{t("signalReceived")}</p>
        <h1>Signal Captured</h1>
        <p>Stored on Walrus</p>
        <p>{t("thanksForFeedback")}</p>
        <div className="success-copy">
          <p>{form.encryptSubmissions ? "Encrypted by Seal" : "Stored without full-payload encryption"}</p>
          <p>Delivered to creator inbox</p>
        </div>
        <section className="answer-card">
          <h3>Signal Metadata</h3>
          <div className="metadata-list">
            <div className="metadata-row">
              <span>Submission Blob ID</span>
              <div>
                <strong className="blob-prominent">{submitted.blobId ?? "Not available"}</strong>
                <BlobLink blobId={submitted.blobId} label="Verify on Walrus" />
              </div>
            </div>
            <div className="metadata-row">
              <span>Encrypted Payload Blob ID</span>
              <div>
                <strong className="blob-prominent">
                  {submitted.encryptedBlobId ?? "Not available"}
                </strong>
                <BlobLink blobId={submitted.encryptedBlobId} label="Verify on Walrus" />
              </div>
            </div>
            <div className="metadata-row">
              <span>Attachment Blob IDs</span>
              <div className="stack">
                {submitted.attachments.length === 0 ? (
                  <strong>Not available</strong>
                ) : (
                  submitted.attachments.map((attachment, index) => (
                    <div key={attachment.blobId}>
                      <strong className="blob-prominent">
                        Attachment {index + 1}: {attachment.blobId}
                      </strong>
                      <BlobLink blobId={attachment.blobId} label="Verify on Walrus" />
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="metadata-row">
              <span>Seal mode</span>
              <strong>{sealRuntime.isFallback ? "fallback" : sealRuntime.activeMode}</strong>
            </div>
          </div>
        </section>
        <div className="inline-actions demo-actions">
          <Link className="ghost-button" to={`/dashboard/forms/${form.id}/submissions/${submitted.id}`}>
            {t("openInboxDemo")}
          </Link>
          <Link className="primary-button" to={`/dashboard/forms/${form.id}/submissions/${submitted.id}`}>
            {t("reviewAndDecrypt")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form className="panel glow-panel public-form" onSubmit={handleSubmit}>
      <p className="eyebrow">{t("publicEyebrow")}</p>
      <h1>{form.title}</h1>
      <p className="lede">{form.description || t("publicDefaultBody")}</p>
      <div className="info-banner">
        <strong>{t("encryptSubmissions")}</strong>
        <span>{form.encryptSubmissions ? t("enabled") : t("disabled")}</span>
      </div>
      <div className="stack">
        {form.fields.map((field) => (
          <DynamicField
            key={field.id}
            field={field}
            value={answers[field.id]}
            error={errors[field.id]}
            onChange={(value) => updateAnswer(field.id, value)}
          />
        ))}
      </div>
      <button type="submit" className="primary-button" disabled={submitting}>
        {submitting ? t("submitting") : t("submitFeedback")}
      </button>
    </form>
  );
}
