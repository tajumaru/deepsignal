import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { FormFieldEditor } from "../components/FormFieldEditor";
import { ShareCard } from "../components/ShareCard";
import { useI18n } from "../i18n";
import {
  createTemplateFields,
  defaultComposerTemplateKey,
  formTemplates,
  getTemplateDefinition,
  normalizeFormPurpose,
} from "../lib/formTemplates";
import { isLocalFallbackBlob } from "../lib/proof";
import { storageAdapter } from "../lib/storage";
import { shortAddress } from "../lib/sui";
import { makeId } from "../lib/utils";
import type { FieldType, FormField, FormPurpose, FormSchema } from "../types";

type PublishStageKey = "encoding" | "encrypting" | "sending" | "stored" | "active";

type PublishPhase = {
  key: PublishStageKey;
  label: string;
  detail: string;
};

const publishPhases: PublishPhase[] = [
  {
    key: "encoding",
    label: "[ Encoding signal ]",
    detail: "Normalizing structure for deep transit.",
  },
  {
    key: "encrypting",
    label: "[ Encrypting payload ]",
    detail: "Reducing surface noise before release.",
  },
  {
    key: "sending",
    label: "[ Sending to Walrus ]",
    detail: "Handing the signal to the abyssal network.",
  },
  {
    key: "stored",
    label: "[ Blob stored ]",
    detail: "Immutable blob registered for observation.",
  },
  {
    key: "active",
    label: "[ Signal active ]",
    detail: "Passive monitoring has started.",
  },
];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createField(type: FieldType = "shortText"): FormField {
  return {
    id: makeId("field"),
    type,
    label: "",
    required: false,
    sensitive: false,
    options: type === "dropdown" || type === "checkbox" ? ["Option 1", "Option 2"] : undefined,
  };
}

function cloneField(field: FormField): FormField {
  return {
    ...field,
    id: makeId("field"),
    options: field.options ? [...field.options] : undefined,
  };
}

const initialTemplate = getTemplateDefinition(defaultComposerTemplateKey);
const initialFields = createTemplateFields(initialTemplate);

function serializeDraft(
  title: string,
  description: string,
  fields: FormField[],
  purpose: FormPurpose,
  createOnSui: boolean,
  encryptSubmissions: boolean,
) {
  return JSON.stringify({
    title,
    description,
    purpose,
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

const INITIAL_DRAFT_SNAPSHOT = serializeDraft(
  initialTemplate.title,
  initialTemplate.description,
  initialFields,
  initialTemplate.purpose,
  false,
  true,
);

export function FormBuilderPage() {
  const { fieldTypeLabel, t } = useI18n();
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const labelRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const publishRunRef = useRef(0);
  const blobTypingTimerRef = useRef<number | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(defaultComposerTemplateKey);
  const [title, setTitle] = useState(initialTemplate.title);
  const [description, setDescription] = useState(initialTemplate.description);
  const [fields, setFields] = useState<FormField[]>(initialFields);
  const [purpose, setPurpose] = useState<FormPurpose>(initialTemplate.purpose);
  const [createOnSui, setCreateOnSui] = useState(false);
  const [encryptSubmissions, setEncryptSubmissions] = useState(true);
  const [savedForm, setSavedForm] = useState<FormSchema | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(INITIAL_DRAFT_SNAPSHOT);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState(initialFields[0]?.id ?? "");
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [pendingFocusFieldId, setPendingFocusFieldId] = useState(initialFields[0]?.id ?? "");
  const [publishOverlayOpen, setPublishOverlayOpen] = useState(false);
  const [publishStageIndex, setPublishStageIndex] = useState(0);
  const [publishBlobId, setPublishBlobId] = useState("");
  const [typedBlobId, setTypedBlobId] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [blobCopied, setBlobCopied] = useState(false);
  const [publishStorageMode, setPublishStorageMode] = useState<"walrus" | "local">("walrus");

  const draftSnapshot = useMemo(
    () => serializeDraft(title, description, fields, purpose, createOnSui, encryptSubmissions),
    [createOnSui, description, encryptSubmissions, fields, purpose, title],
  );

  const isDirty = draftSnapshot !== lastSavedSnapshot;
  const hasValidTitle = Boolean(title.trim());
  const hasQuestions = fields.length > 0;
  const isReadyToPublish = hasValidTitle && hasQuestions;

  useEffect(() => {
    document.body.classList.add("composer-mode");
    return () => document.body.classList.remove("composer-mode");
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (savedForm && draftSnapshot !== lastSavedSnapshot) {
      setSavedForm(null);
    }
  }, [draftSnapshot, lastSavedSnapshot, savedForm]);

  useEffect(() => {
    if (!pendingFocusFieldId) {
      return;
    }
    const node = labelRefs.current[pendingFocusFieldId];
    if (!node) {
      return;
    }
    node.focus();
    node.select();
    setActiveFieldId(pendingFocusFieldId);
    setPendingFocusFieldId("");
  }, [fields, pendingFocusFieldId]);

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

  useEffect(() => {
    const handleDuplicateShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "d") {
        return;
      }
      event.preventDefault();
      duplicateFieldAt(activeFieldId);
    };
    window.addEventListener("keydown", handleDuplicateShortcut);
    return () => window.removeEventListener("keydown", handleDuplicateShortcut);
  }, [activeFieldId]);

  useEffect(() => {
    return () => {
      if (blobTypingTimerRef.current) {
        window.clearTimeout(blobTypingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (blobTypingTimerRef.current) {
      window.clearTimeout(blobTypingTimerRef.current);
      blobTypingTimerRef.current = null;
    }
    setTypedBlobId("");
    if (!publishBlobId) {
      return;
    }
    let cursor = 0;
    const frame = () => {
      cursor += 1;
      setTypedBlobId(`BLOB://${publishBlobId.slice(0, cursor)}`);
      if (cursor < publishBlobId.length) {
        blobTypingTimerRef.current = window.setTimeout(frame, 28);
      }
    };
    blobTypingTimerRef.current = window.setTimeout(frame, 140);
    return () => {
      if (blobTypingTimerRef.current) {
        window.clearTimeout(blobTypingTimerRef.current);
      }
    };
  }, [publishBlobId]);

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

  function replaceFields(nextFields: FormField[]) {
    setFields(nextFields);
    setActiveFieldId(nextFields[0]?.id ?? "");
    setPendingFocusFieldId(nextFields[0]?.id ?? "");
  }

  function applyTemplate(templateKey: string) {
    const template = getTemplateDefinition(templateKey);
    const nextFields = createTemplateFields(template);
    startTransition(() => {
      setSelectedTemplateKey(template.key);
      setPurpose(normalizeFormPurpose(template.purpose));
      setTitle(template.title);
      setDescription(template.description);
      replaceFields(nextFields);
      setAddMenuOpen(false);
      setError("");
    });
  }

  function updateField(index: number, nextField: FormField) {
    setFields((current) => current.map((field, currentIndex) => (currentIndex === index ? nextField : field)));
  }

  function insertField(type: FieldType, afterIndex?: number) {
    const nextField = createField(type);
    setFields((current) => {
      if (afterIndex === undefined || afterIndex < 0 || afterIndex >= current.length) {
        return [...current, nextField];
      }
      const next = [...current];
      next.splice(afterIndex + 1, 0, nextField);
      return next;
    });
    setPendingFocusFieldId(nextField.id);
    setActiveFieldId(nextField.id);
    setAddMenuOpen(false);
  }

  function duplicateFieldAt(fieldId: string) {
    if (!fieldId) {
      return;
    }
    setFields((current) => {
      const sourceIndex = current.findIndex((field) => field.id === fieldId);
      if (sourceIndex === -1) {
        return current;
      }
      const nextField = cloneField(current[sourceIndex]);
      const next = [...current];
      next.splice(sourceIndex + 1, 0, nextField);
      setPendingFocusFieldId(nextField.id);
      setActiveFieldId(nextField.id);
      return next;
    });
  }

  function removeField(fieldId: string) {
    setFields((current) => {
      if (current.length === 1) {
        return current;
      }
      const next = current.filter((field) => field.id !== fieldId);
      if (activeFieldId === fieldId) {
        setActiveFieldId(next[0]?.id ?? "");
      }
      return next;
    });
  }

  function reorderFields(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }
    setFields((current) => {
      const sourceIndex = current.findIndex((field) => field.id === sourceId);
      const targetIndex = current.findIndex((field) => field.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
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
          !(field.options ?? []).map((option) => option.trim()).filter(Boolean).length,
      )
    ) {
      setError(t("errorFieldNeedsOption"));
      return;
    }
    if (!account?.address) {
      setError(t("connectWalletFirst"));
      return;
    }

    const runId = publishRunRef.current + 1;
    publishRunRef.current = runId;
    setSaving(true);
    setPublishOverlayOpen(true);
    setPublishStageIndex(0);
    setPublishBlobId("");
    setTypedBlobId("");
    setLinkCopied(false);
    setBlobCopied(false);
    setPublishStorageMode("walrus");
    const form: FormSchema = {
      id: makeId("form"),
      title: title.trim(),
      description: description.trim(),
      fields: fields.map((field) => ({
        ...field,
        label: field.label.trim(),
        options:
          field.type === "dropdown" || field.type === "checkbox"
            ? (field.options ?? []).map((option) => option.trim()).filter(Boolean)
            : undefined,
      })),
      purpose,
      createdAt: new Date().toISOString(),
      ownerAddress: account.address,
      isOnchain: false,
      encryptSubmissions,
    };

    try {
      setPublishStageIndex(0);
      await wait(320);
      if (publishRunRef.current !== runId) {
        return;
      }
      setPublishStageIndex(1);
      await wait(560);
      if (publishRunRef.current !== runId) {
        return;
      }
      setPublishStageIndex(2);
      const { blobId, manifestBlobId } = await storageAdapter.saveForm(form);
      if (publishRunRef.current !== runId) {
        return;
      }
      await wait(620);
      setPublishStageIndex(3);
      setPublishBlobId(blobId ?? "unresolved");
      setPublishStorageMode(isLocalFallbackBlob(blobId) ? "local" : "walrus");
      await wait(780);
      if (publishRunRef.current !== runId) {
        return;
      }
      setPublishStageIndex(4);
      setSavedForm({ ...form, blobId, manifestBlobId });
      setLastSavedSnapshot(draftSnapshot);
      setError("");
    } catch (submitError) {
      setPublishOverlayOpen(false);
      setError(submitError instanceof Error ? submitError.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const questionTypes: FieldType[] = [
    "shortText",
    "longText",
    "dropdown",
    "checkbox",
    "rating",
    "screenshot",
    "video",
    "url",
  ];

  const steps = [
    { key: "title", label: t("composerStepTitle"), done: hasValidTitle },
    { key: "questions", label: t("composerStepQuestions"), done: hasQuestions },
    { key: "publish", label: t("composerStepPublish"), done: Boolean(savedForm) },
  ];

  const publishChecks = savedForm
    ? [
        isLocalFallbackBlob(savedForm.blobId) ? t("signalStoredLocally") : t("signalStoredOnWalrus"),
        t("publishChecklistBlob"),
        t("publishChecklistInbox"),
        ...(savedForm.manifestBlobId ? [t("publishChecklistManifest")] : []),
      ]
    : [];

  const publicPath = savedForm ? `/f/${savedForm.id}` : "";
  const publicUrl = savedForm && typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : publicPath;

  async function handleCopyLink() {
    if (!publicUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch (copyError) {
      console.error(copyError);
    }
  }

  async function handleCopyBlobId() {
    if (!publishBlobId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(publishBlobId);
      setBlobCopied(true);
      window.setTimeout(() => setBlobCopied(false), 1800);
    } catch (copyError) {
      console.error(copyError);
    }
  }

  return (
    <AdminAccessGate hasWallet={Boolean(account?.address)} access="allowed">
      <section className="composer-shell">
        {publishOverlayOpen ? (
          <div className="publish-overlay" role="dialog" aria-modal="true" aria-labelledby="publish-overlay-title">
            <div className="publish-overlay-backdrop" onClick={() => (saving ? undefined : setPublishOverlayOpen(false))} />
            <div className="publish-overlay-panel">
              <div className="publish-overlay-noise" aria-hidden="true" />
              <div className="publish-overlay-scanlines" aria-hidden="true" />
              <div className="publish-overlay-particles" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, index) => (
                  <span key={index} className={`publish-particle publish-particle-${(index % 4) + 1}`} />
                ))}
              </div>
              <div className="publish-overlay-rings" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>

              <div className={`publish-signal-shell stage-${publishPhases[publishStageIndex]?.key ?? "encoding"}`}>
                <div className="publish-signal-card">
                  <span className="publish-signal-label">SIGNAL PAYLOAD</span>
                  <strong>{title.trim() || t("untitledForm")}</strong>
                  <p>{description.trim() || "No intro recorded."}</p>
                  <div className="publish-signal-metrics">
                    <span>{fields.length} nodes</span>
                    <span>{encryptSubmissions ? "sealed" : "plain"}</span>
                    <span>{purpose}</span>
                  </div>
                </div>
              </div>

              <div className="publish-overlay-copy">
                <p className="eyebrow">Deep Transit</p>
                <h2 id="publish-overlay-title">Signal processing</h2>
                <p className="muted publish-overlay-intro">
                  The payload is being reduced, submerged, and fixed into the Walrus observation layer.
                </p>
              </div>

              <div className="publish-terminal panel">
                <div className="publish-terminal-header">
                  <span>OBSERVATION // WALRUS UPLINK</span>
                  <strong>{publishStageIndex >= 4 ? "PASSIVE WATCH" : "TRANSIT"}</strong>
                </div>
                <div className="publish-terminal-log" aria-live="polite">
                  {publishPhases.map((phase, index) => {
                    const state =
                      index < publishStageIndex ? "done" : index === publishStageIndex ? "active" : "queued";
                    return (
                      <div key={phase.key} className={`publish-terminal-row is-${state}`}>
                        <span>{phase.label}</span>
                        <small>{state === "done" ? "complete" : state === "active" ? "in progress" : "queued"}</small>
                      </div>
                    );
                  })}
                </div>
                <p className="publish-terminal-detail">{publishPhases[publishStageIndex]?.detail}</p>
              </div>

              <div className={`publish-blob-panel ${publishStageIndex >= 3 ? "is-visible" : ""}`}>
                <p className="eyebrow">Blob Address</p>
                <code className="publish-blob-id">{typedBlobId || "BLOB://........"}</code>
                <div className="publish-blob-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleCopyBlobId()}
                    disabled={publishStageIndex < 3 || !publishBlobId}
                  >
                    {blobCopied ? "Copied" : "Copy Blob ID"}
                  </button>
                  <span className="publish-storage-note">
                    {publishStorageMode === "walrus" ? "Immutable Walrus blob confirmed." : "Stored locally. Walrus relay unavailable."}
                  </span>
                </div>
              </div>

              <div className={`publish-active-panel ${publishStageIndex >= 4 ? "is-visible" : ""}`}>
                <div>
                  <p className="eyebrow">Observation State</p>
                  <h3>SIGNAL ACTIVE</h3>
                  <p className="muted">The signal is now available for monitoring, routing, and review.</p>
                </div>
                <div className="publish-active-actions">
                  <button type="button" className="primary-button" onClick={() => void handleCopyLink()}>
                    {linkCopied ? "Copied Link" : "Copy Link"}
                  </button>
                  {savedForm ? (
                    <>
                      <Link className="ghost-button" to={`/dashboard/forms/${savedForm.id}`}>
                        Open Dashboard
                      </Link>
                      <Link className="ghost-button" to={`/f/${savedForm.id}`}>
                        View Signals
                      </Link>
                    </>
                  ) : null}
                  <button type="button" className="ghost-button" onClick={() => setPublishOverlayOpen(false)}>
                    Close Monitor
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className={`composer-toolbar panel ${isScrolled ? "is-scrolled" : ""}`}>
          <div className="composer-toolbar-copy">
            <p className="eyebrow">{t("builderEyebrow")}</p>
            <h1>{t("builderTitle")}</h1>
            <p className="muted composer-intro">{t("composerIntro")}</p>
          </div>

          <div className="composer-stepper" aria-label="Composer steps">
            {steps.map((step, index) => (
              <div key={step.key} className={`composer-step ${step.done ? "is-done" : ""}`}>
                <span>{index + 1}</span>
                <strong>{step.label}</strong>
              </div>
            ))}
          </div>

          <div className="composer-toolbar-actions">
            <button type="button" className="ghost-button" onClick={handleNavigateHome}>
              {t("backToHome")}
            </button>
            {savedForm ? (
              <Link className="ghost-button" to={`/f/${savedForm.id}`}>
                {t("openLiveForm")}
              </Link>
            ) : null}
            <button type="submit" form="create-form" className="primary-button" disabled={saving}>
              {saving ? t("builderSaving") : t("builderSave")}
            </button>
          </div>
        </div>

        <form id="create-form" className="composer-stage" onSubmit={handleSubmit}>
          <section className="panel glow-panel composer-hero-card">
            <div className="composer-hero-copy">
              <p className="eyebrow">{t("templateEyebrow")}</p>
              <h2>{t("templateTitle")}</h2>
              <p className="muted">{t("templateCustomBody")}</p>
            </div>
            <div className="composer-template-grid">
              {formTemplates.map((template) => {
                const active = selectedTemplateKey === template.key;
                return (
                  <button
                    key={template.key}
                    type="button"
                    className={`composer-template-card ${active ? "is-active" : ""}`}
                    onClick={() => applyTemplate(template.key)}
                  >
                    <span className="composer-template-emoji" aria-hidden="true">
                      {template.emoji}
                    </span>
                    <strong>{template.label}</strong>
                    <span className="muted">{template.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel composer-section-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">{t("composerStepTitle")}</p>
                <h2>{title.trim() || t("untitledForm")}</h2>
              </div>
            </div>

            <label>
              <span>{t("formTitle")}</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label>
              <span>{t("description")}</span>
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("builderDescriptionPlaceholder")}
              />
            </label>
          </section>

          <section className="panel composer-section-card">
            <div className="section-row composer-question-header">
              <div>
                <p className="eyebrow">{t("composerStepQuestions")}</p>
                <h2>{t("fields")}</h2>
                <p className="muted">{t("questionCount", { count: fields.length })}</p>
              </div>

              <div className="add-question-wrap">
                <button
                  type="button"
                  className="ghost-button add-question-trigger"
                  onClick={() => setAddMenuOpen((current) => !current)}
                >
                  {t("addQuestion")}
                </button>
                {addMenuOpen ? (
                  <div className="add-question-menu panel">
                    {questionTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="add-question-option"
                        onClick={() => insertField(type)}
                      >
                        {fieldTypeLabel(type)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="stack composer-question-stack">
              {fields.map((field, index) => (
                <FormFieldEditor
                  key={field.id}
                  field={field}
                  index={index}
                  isDragging={draggedFieldId === field.id}
                  labelRef={(node) => {
                    labelRefs.current[field.id] = node;
                  }}
                  onChange={(nextField) => updateField(index, nextField)}
                  onRemove={() => removeField(field.id)}
                  onDuplicate={() => duplicateFieldAt(field.id)}
                  onAddBelow={() => insertField(field.type, index)}
                  onFocus={() => setActiveFieldId(field.id)}
                  onDragStart={(event: DragEvent<HTMLElement>) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedFieldId(field.id);
                  }}
                  onDragOver={(event: DragEvent<HTMLElement>) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event: DragEvent<HTMLElement>) => {
                    event.preventDefault();
                    if (draggedFieldId) {
                      reorderFields(draggedFieldId, field.id);
                    }
                    setDraggedFieldId(null);
                  }}
                />
              ))}
            </div>

            <div className="composer-question-footer">
              <button type="button" className="ghost-button" onClick={() => setAddMenuOpen(true)}>
                {t("addQuestion")}
              </button>
              <p className="muted composer-shortcut-note">{t("shortcutHint")}</p>
            </div>
          </section>

          <section className="panel composer-section-card composer-publish-panel">
            <div className="section-row">
              <div>
                <p className="eyebrow">{t("composerStepPublish")}</p>
                <h2>{savedForm ? t("formPublished") : t("publishReadyTitle")}</h2>
                <p className="muted">
                  {savedForm ? t("signalStoredOnWalrus") : t("publishReadyBody")}
                </p>
              </div>
              <button type="submit" className="primary-button" disabled={saving || !isReadyToPublish}>
                {saving ? t("builderSaving") : t("builderSave")}
              </button>
            </div>

            <p className="wallet-inline-note">
              {t("formOwnerLabel")}: {account?.address ? shortAddress(account.address) : t("walletPublishHint")}
            </p>

            <details className="composer-advanced-settings">
              <summary>{t("advanced")}</summary>
              <div className="stack composer-advanced-grid">
                <section className="panel composer-settings-card">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">{t("sealEyebrow")}</p>
                      <h3>{t("encryptSubmissions")}</h3>
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

                <section className="panel composer-settings-card">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">{t("suiCreateEyebrow")}</p>
                      <h3>{t("createOnSui")}</h3>
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
                  <p className="muted">{t("createOnSuiHelp")}</p>
                </section>
              </div>
            </details>

            {error ? <p className="error-text">{error}</p> : null}

            {savedForm ? (
              <div className="success-card composer-success-card">
                <div className="composer-success-header">
                  <div>
                    <p className="eyebrow">Observation Relay</p>
                    <h3>SIGNAL ACTIVE</h3>
                    <p className="muted">
                      {isLocalFallbackBlob(savedForm.blobId) ? t("signalStoredLocally") : t("signalStoredOnWalrus")}
                    </p>
                  </div>
                  <span className="composer-live-pill">Observing</span>
                </div>

                <div className="composer-publish-checks">
                  {publishChecks.map((check) => (
                    <p key={check}>{check}</p>
                  ))}
                </div>

                <div className="composer-link-grid">
                  <p>
                    {t("publicShareLink")}: <Link to={`/f/${savedForm.id}`}>/f/{savedForm.id}</Link>
                  </p>
                  <p>
                    {t("adminPage")}: <Link to={`/dashboard/forms/${savedForm.id}`}>{t("adminPageCta")}</Link>
                  </p>
                  <p>
                    {t("walrusBlobId")}: {savedForm.blobId}
                  </p>
                  <BlobLink blobId={savedForm.blobId} />
                  {savedForm.manifestBlobId ? (
                    <>
                      <p>
                        Manifest Blob ID: {savedForm.manifestBlobId}
                      </p>
                      <BlobLink blobId={savedForm.manifestBlobId} label="Verify manifest on Walrus" />
                      <p>
                        {t("restoreLink")}: <Link to={`/m/${savedForm.manifestBlobId}`}>/m/{savedForm.manifestBlobId}</Link>
                      </p>
                    </>
                  ) : null}
                </div>

                <ShareCard formId={savedForm.id} blobId={savedForm.blobId} createdAt={savedForm.createdAt} />
              </div>
            ) : (
              <p className="muted">{t("saveFormHint")}</p>
            )}
          </section>
        </form>
      </section>
    </AdminAccessGate>
  );
}
