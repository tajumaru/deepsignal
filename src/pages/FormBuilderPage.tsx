import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { FormFieldEditor } from "../components/FormFieldEditor";
import { ShareCard } from "../components/ShareCard";
import { useI18n } from "../i18n";
import { fieldTypeOptions } from "../lib/constants";
import { shortAddress } from "../lib/sui";
import { storageAdapter } from "../lib/storage";
import { makeId } from "../lib/utils";
import type { FormField, FormSchema } from "../types";

function createField(type = fieldTypeOptions[0]): FormField {
  return {
    id: makeId("field"),
    type,
    label: "",
    required: false,
    sensitive: false,
    options: type === "dropdown" || type === "checkbox" ? [""] : undefined,
  };
}

function serializeDraft(
  title: string,
  description: string,
  fields: FormField[],
  createOnSui: boolean,
  encryptSubmissions: boolean,
) {
  return JSON.stringify({
    title,
    description,
    createOnSui,
    encryptSubmissions,
    fields: fields.map((field) => ({
      type: field.type,
      label: field.label,
      required: field.required,
      sensitive: field.sensitive,
      options: field.options ?? [],
    })),
  });
}

const INITIAL_DRAFT_SNAPSHOT = serializeDraft("", "", [createField()], false, true);

export function FormBuilderPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FormField[]>([createField()]);
  const [createOnSui, setCreateOnSui] = useState(false);
  const [encryptSubmissions, setEncryptSubmissions] = useState(true);
  const [savedForm, setSavedForm] = useState<FormSchema | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(INITIAL_DRAFT_SNAPSHOT);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const draftSnapshot = useMemo(
    () => serializeDraft(title, description, fields, createOnSui, encryptSubmissions),
    [createOnSui, description, encryptSubmissions, fields, title],
  );

  const isDirty = draftSnapshot !== lastSavedSnapshot;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function confirmDiscardChanges() {
    if (!isDirty) {
      return true;
    }
    return window.confirm(t("discardChangesConfirm"));
  }

  function handleNavigateHome() {
    if (!confirmDiscardChanges()) {
      return;
    }
    navigate("/");
  }

  function updateField(index: number, nextField: FormField) {
    setFields((current) => current.map((field, idx) => (idx === index ? nextField : field)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!title.trim()) {
      setError(t("errorFormTitleRequired"));
      return;
    }
    if (fields.length === 0) {
      setError(t("errorNeedField"));
      return;
    }
    if (fields.some((field) => !field.label.trim())) {
      setError(t("errorEveryFieldNeedsLabel"));
      return;
    }
    if (
      fields.some(
        (field) =>
          (field.type === "dropdown" || field.type === "checkbox") &&
          !(field.options ?? []).filter(Boolean).length,
      )
    ) {
      setError(t("errorFieldNeedsOption"));
      return;
    }
    if (!account?.address) {
      setError(t("connectWalletFirst"));
      return;
    }

    setSaving(true);
    const form: FormSchema = {
      id: makeId("form"),
      title: title.trim(),
      description: description.trim(),
      fields: fields.map((field) => ({
        ...field,
        label: field.label.trim(),
        options:
          field.type === "dropdown" || field.type === "checkbox"
            ? (field.options ?? []).filter(Boolean)
            : undefined,
      })),
      createdAt: new Date().toISOString(),
      ownerAddress: account.address,
      isOnchain: false,
      encryptSubmissions,
    };
    try {
      const { blobId } = await storageAdapter.saveForm(form);
      setSavedForm({ ...form, blobId });
      setLastSavedSnapshot(draftSnapshot);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminAccessGate hasWallet={Boolean(account?.address)} access="allowed">
      <section className="grid builder-layout">
      <div className={`form-sticky-bar ${isScrolled ? "is-scrolled" : ""}`}>
        <div className="form-sticky-inner">
          <div className="form-sticky-brand">
            <p className="eyebrow">{t("builderEyebrow")}</p>
            <strong>DeepSignal</strong>
            <span>{t("builderTitle")}</span>
          </div>

          <div className="sticky-form-title-preview">
            <span className="muted">{t("formTitle")}</span>
            <strong>{title.trim() || t("untitledForm")}</strong>
          </div>

          <div className="form-sticky-actions">
            <button
              type="button"
              className="ghost-button sticky-home-button"
              onClick={handleNavigateHome}
            >
              {t("backToHome")}
            </button>
            {savedForm ? (
              <Link className="ghost-button sticky-preview-button" to={`/f/${savedForm.id}`}>
                {t("preview")}
              </Link>
            ) : (
              <button type="button" className="ghost-button sticky-preview-button" disabled>
                {t("preview")}
              </button>
            )}

            <button
              type="submit"
              form="create-form"
              className="primary-button sticky-create-button"
              disabled={saving}
            >
              {saving ? t("builderSaving") : t("builderSave")}
            </button>
          </div>
        </div>
      </div>

      <div className="builder-form-stack">
        <form id="create-form" className="panel glow-panel" onSubmit={handleSubmit}>
          <div className="section-row">
            <div>
              <p className="eyebrow">{t("builderEyebrow")}</p>
              <h1>{t("builderTitle")}</h1>
            </div>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? t("builderSaving") : t("builderSave")}
            </button>
          </div>

          <label>
            <span>{t("formTitle")}</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label>
            <span>{t("description")}</span>
            <textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("builderDescriptionPlaceholder")}
            />
          </label>

          <section className="panel field-editor sui-toggle-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">{t("suiCreateEyebrow")}</p>
                <h2>{t("createOnSui")}</h2>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={createOnSui}
                  onChange={(event) => setCreateOnSui(event.target.checked)}
                />
                <span>{createOnSui ? t("enabled") : t("disabled")}</span>
              </label>
            </div>
            <p className="muted">Sui registry integration placeholder.</p>
            <p className="wallet-inline-note">
              {t("formOwnerLabel")}: {account?.address ? shortAddress(account.address) : "Not connected"}
            </p>
          </section>

          <section className="panel field-editor sui-toggle-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">{t("sealEyebrow")}</p>
                <h2>{t("encryptSubmissions")}</h2>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={encryptSubmissions}
                  onChange={(event) => setEncryptSubmissions(event.target.checked)}
                />
                <span>{encryptSubmissions ? t("enabled") : t("disabled")}</span>
              </label>
            </div>
            <p className="muted">{t("encryptSubmissionsHelp")}</p>
          </section>

          <div className="section-row">
            <h2>{t("fields")}</h2>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setFields((current) => [...current, createField()])}
            >
              {t("addField")}
            </button>
          </div>

          <div className="stack">
            {fields.map((field, index) => (
              <FormFieldEditor
                key={field.id}
                field={field}
                index={index}
                canMoveUp={index > 0}
                canMoveDown={index < fields.length - 1}
                onChange={(nextField) => updateField(index, nextField)}
                onRemove={() =>
                  setFields((current) =>
                    current.length === 1
                      ? current
                      : current.filter((item) => item.id !== field.id),
                  )
                }
                onMoveUp={() =>
                  setFields((current) => {
                    const next = [...current];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    return next;
                  })
                }
                onMoveDown={() =>
                  setFields((current) => {
                    const next = [...current];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    return next;
                  })
                }
              />
            ))}
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          <div className="builder-bottom-actions">
            <button
              type="submit"
              className="primary-button builder-bottom-submit"
              disabled={saving}
            >
              {saving ? t("builderSaving") : t("builderSave")}
            </button>
          </div>
        </form>
      </div>

      <aside className="panel">
        <p className="eyebrow">{t("walrusPreview")}</p>
        <h2>{t("deploymentNotes")}</h2>
        <ul className="feature-list">
          <li>{t("deploymentNote1")}</li>
          <li>{t("deploymentNote2")}</li>
          <li>{t("deploymentNote3")}</li>
        </ul>

        {savedForm ? (
          <div className="success-card">
            <h3>{t("formPublished")}</h3>
            <p>
              {t("publicShareLink")}: <Link to={`/f/${savedForm.id}`}>/f/{savedForm.id}</Link>
            </p>
            <p>
              {t("adminPage")}:{" "}
              <Link to={`/dashboard/forms/${savedForm.id}`}>{t("adminPageCta")}</Link>
            </p>
            <p>
              {t("walrusBlobId")}: {savedForm.blobId}
            </p>
            <BlobLink blobId={savedForm.blobId} />
            <ShareCard formId={savedForm.id} />
          </div>
        ) : (
          <p className="muted">{t("saveFormHint")}</p>
        )}
      </aside>
      </section>
    </AdminAccessGate>
  );
}
