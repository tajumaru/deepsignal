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
import { FieldTypePicker } from "../components/formBuilder/FieldTypePicker";
import { FormBuilderSteps } from "../components/formBuilder/FormBuilderSteps";
import { LivePreview } from "../components/formBuilder/LivePreview";
import { SectionEditor } from "../components/formBuilder/SectionEditor";
import { TemplatePicker } from "../components/formBuilder/TemplatePicker";
import { useAccessControl } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";
import { canAdmin, getAdminSurfaceAccessState, getRoleLabel } from "../lib/adminAccess";
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
import type { FieldType, FormField, FormPurpose, FormSchema, FormSection } from "../types";

type PublishStageKey = "encoding" | "encrypting" | "sending" | "stored" | "active";
type BuilderStepKey = "template" | "info" | "fields" | "publish";
type MobileBuilderPane = "editor" | "preview";

type PublishPhase = {
  key: PublishStageKey;
  label: string;
  detail: string;
};

const publishPhases: PublishPhase[] = [
  { key: "encoding", label: "[ Encoding signal ]", detail: "Normalizing structure for deep transit." },
  { key: "encrypting", label: "[ Encrypting payload ]", detail: "Reducing surface noise before release." },
  { key: "sending", label: "[ Sending to Walrus ]", detail: "Handing the signal to the abyssal network." },
  { key: "stored", label: "[ Blob stored ]", detail: "Immutable blob registered for observation." },
  { key: "active", label: "[ Signal active ]", detail: "Passive monitoring has started." },
];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createField(type: FieldType = "shortText", sectionId?: string): FormField {
  return {
    id: makeId("field"),
    type,
    label: "",
    required: false,
    sensitive: false,
    visibility: "public",
    adminOnly: false,
    sectionId,
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

function createSection(title = ""): FormSection {
  return {
    id: makeId("section"),
    title,
    description: "",
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
  sections: FormSection[],
) {
  return JSON.stringify({
    title,
    description,
    purpose,
    createOnSui,
    encryptSubmissions,
    sections: sections.map((section) => ({
      title: section.title,
      description: section.description ?? "",
    })),
    fields: fields.map((field) => ({
      type: field.type,
      label: field.label,
      required: field.required,
      sensitive: field.sensitive,
      sectionId: field.sectionId ?? "",
      adminOnly: Boolean(field.adminOnly),
      visibility: field.visibility ?? "public",
      validationHint: field.validationHint ?? "",
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
  [],
);

export function FormBuilderPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(account?.address);
  const navigate = useNavigate();
  const labelRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fieldCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const publishRunRef = useRef(0);
  const blobTypingTimerRef = useRef<number | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(defaultComposerTemplateKey);
  const [title, setTitle] = useState(initialTemplate.title);
  const [description, setDescription] = useState(initialTemplate.description);
  const [fields, setFields] = useState<FormField[]>(initialFields);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [purpose, setPurpose] = useState<FormPurpose>(initialTemplate.purpose);
  const [createOnSui, setCreateOnSui] = useState(false);
  const [encryptSubmissions, setEncryptSubmissions] = useState(true);
  const [savedForm, setSavedForm] = useState<FormSchema | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(INITIAL_DRAFT_SNAPSHOT);
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
  const [currentStep, setCurrentStep] = useState<BuilderStepKey>("template");
  const [mobilePane, setMobilePane] = useState<MobileBuilderPane>("editor");
  const [fieldTypePickerOpen, setFieldTypePickerOpen] = useState(false);

  const draftSnapshot = useMemo(
    () => serializeDraft(title, description, fields, purpose, createOnSui, encryptSubmissions, sections),
    [createOnSui, description, encryptSubmissions, fields, purpose, sections, title],
  );

  const isDirty = draftSnapshot !== lastSavedSnapshot;
  const hasValidTitle = Boolean(title.trim());
  const hasQuestions = fields.length > 0;
  const isReadyToPublish = hasValidTitle && hasQuestions;
  const hasAdminAccess = canAdmin(capabilityProfile);
  const accessState = getAdminSurfaceAccessState(
    "admin",
    account?.address,
    capabilityProfile,
  );

  const steps = [
    { key: "template", title: "Step 1", description: "Pick a starting point" },
    { key: "info", title: "Step 2", description: "Basic info" },
    { key: "fields", title: "Step 3", description: "Fields" },
    { key: "publish", title: "Step 4", description: "Preview / Publish" },
  ] satisfies Array<{ key: BuilderStepKey; title: string; description: string }>;

  const completedSteps = [
    selectedTemplateKey ? "template" : "",
    hasValidTitle ? "info" : "",
    hasQuestions ? "fields" : "",
    savedForm ? "publish" : "",
  ].filter(Boolean);

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
    const cardNode = fieldCardRefs.current[pendingFocusFieldId];
    if (cardNode) {
      cardNode.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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

  function goToStep(step: BuilderStepKey) {
    setCurrentStep(step);
    if (step === "publish") {
      setMobilePane("preview");
    }
  }

  function moveStep(direction: -1 | 1) {
    const index = steps.findIndex((step) => step.key === currentStep);
    const next = steps[index + direction];
    if (next) {
      goToStep(next.key);
    }
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
      setSections([]);
      replaceFields(nextFields);
      setError("");
      goToStep("info");
    });
  }

  function updateField(index: number, nextField: FormField) {
    setFields((current) => current.map((field, currentIndex) => (currentIndex === index ? nextField : field)));
  }

  function insertField(type: FieldType, afterIndex?: number) {
    const activeField = fields.find((field) => field.id === activeFieldId);
    const nextField = createField(type, activeField?.sectionId);
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
    setMobilePane("editor");
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

  function addSection(preset?: string) {
    const nextSection = createSection(preset ?? "");
    setSections((current) => [...current, nextSection]);
  }

  function updateSection(sectionId: string, patch: Partial<FormSection>) {
    setSections((current) => current.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)));
  }

  function removeSection(sectionId: string) {
    setSections((current) => current.filter((section) => section.id !== sectionId));
    setFields((current) =>
      current.map((field) => (field.sectionId === sectionId ? { ...field, sectionId: undefined } : field)),
    );
  }

  function focusFieldError(fieldId: string) {
    setMobilePane("editor");
    setActiveFieldId(fieldId);
    setPendingFocusFieldId(fieldId);
  }

  function validateFieldsStep() {
    if (fields.length === 0) {
      setError(t("errorNeedField"));
      return false;
    }

    const emptyLabelField = fields.find((field) => !field.label.trim());
    if (emptyLabelField) {
      setError(t("errorEveryFieldNeedsLabel"));
      focusFieldError(emptyLabelField.id);
      return false;
    }

    const emptyOptionsField = fields.find(
      (field) =>
        (field.type === "dropdown" || field.type === "checkbox") &&
        !(field.options ?? []).map((option) => option.trim()).filter(Boolean).length,
    );
    if (emptyOptionsField) {
      setError(t("errorFieldNeedsOption"));
      focusFieldError(emptyOptionsField.id);
      return false;
    }

    return true;
  }

  function handleFieldsContinue() {
    setError("");
    if (!validateFieldsStep()) {
      return;
    }
    moveStep(1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!title.trim()) {
      setError(t("errorFormTitleRequired"));
      goToStep("info");
      return;
    }
    if (!validateFieldsStep()) {
      goToStep("fields");
      return;
    }
    if (!account?.address) {
      setError(t("connectWalletFirst"));
      goToStep("publish");
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
        validationHint: field.validationHint?.trim() || undefined,
        options:
          field.type === "dropdown" || field.type === "checkbox"
            ? (field.options ?? []).map((option) => option.trim()).filter(Boolean)
            : undefined,
      })),
      sections: sections
        .map((section) => ({
          ...section,
          title: section.title.trim(),
          description: section.description?.trim() || undefined,
        }))
        .filter((section) => section.title),
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

  if (isLoadingAccess) {
    return <div className="panel">Checking wallet capabilities...</div>;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={accessState}
      deniedBody={
        capabilityProfile.isConfigured
          ? "OwnerCap または AdminCap を持つウォレットだけがフォーム作成と管理操作を実行できます。"
          : undefined
      }
    >
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

        <FieldTypePicker
          open={fieldTypePickerOpen}
          onClose={() => setFieldTypePickerOpen(false)}
          onPick={(type) => insertField(type)}
        />

        <div className={`composer-toolbar panel ${isScrolled ? "is-scrolled" : ""}`}>
          <div className="composer-toolbar-copy">
            <p className="eyebrow">{t("builderEyebrow")}</p>
            <h1>{t("builderTitle")}</h1>
            <p className="muted composer-intro">{t("composerIntro")}</p>
            {capabilityProfile.isConfigured ? (
              <p className="muted">
                Access Role: {getRoleLabel(capabilityProfile)}
                {hasAdminAccess && capabilityProfile.adminCapIds[0]
                  ? ` (${shortAddress(capabilityProfile.adminCapIds[0])})`
                  : ""}
              </p>
            ) : null}
          </div>

          <FormBuilderSteps
            steps={steps}
            currentStep={currentStep}
            completedSteps={completedSteps}
            onSelect={(stepKey) => goToStep(stepKey as BuilderStepKey)}
          />

          <div className="composer-toolbar-actions">
            <button type="button" className="ghost-button" onClick={handleNavigateHome}>
              {t("backToHome")}
            </button>
            {savedForm ? (
              <Link className="ghost-button" to={`/f/${savedForm.id}`}>
                {t("openLiveForm")}
              </Link>
            ) : null}
          </div>
        </div>

        <form id="create-form" className="composer-stage composer-step-stage" onSubmit={handleSubmit}>
          {currentStep === "template" ? (
            <section className="panel glow-panel composer-hero-card">
              <div className="composer-hero-copy">
                <p className="eyebrow">{t("templateEyebrow")}</p>
                <h2>{t("templateTitle")}</h2>
                <p className="muted">{t("templateCustomBody")}</p>
              </div>
              <TemplatePicker
                templates={formTemplates}
                selectedTemplateKey={selectedTemplateKey}
                onSelect={applyTemplate}
              />
              <div className="composer-step-actions">
                <button type="button" className="ghost-button" onClick={handleNavigateHome}>
                  {t("backToHome")}
                </button>
              </div>
            </section>
          ) : null}

          {currentStep === "info" ? (
            <section className="panel composer-section-card composer-step-card">
              <div className="section-row">
                <div>
                  <p className="eyebrow">Step 2</p>
                  <h2>{t("basicInfoTitle")}</h2>
                  <p className="muted">{t("basicInfoBody")}</p>
                </div>
              </div>

              <div className="composer-info-grid">
                <label>
                  <span>{t("formTitle")}</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>

                <label className="composer-info-intro">
                  <span>{t("description")}</span>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t("builderDescriptionPlaceholder")}
                  />
                </label>
              </div>

              <div className="composer-step-actions">
                <button type="button" className="ghost-button" onClick={() => moveStep(-1)}>
                  {t("back")}
                </button>
                <button type="button" className="primary-button" onClick={() => moveStep(1)}>
                  {t("continue")}
                </button>
              </div>
            </section>
          ) : null}

          {currentStep === "fields" ? (
            <section className="composer-builder-grid">
              <div className="composer-mobile-tabs" role="tablist" aria-label="Builder view">
                <button
                  type="button"
                  className={`composer-mobile-tab ${mobilePane === "editor" ? "is-active" : ""}`}
                  onClick={() => setMobilePane("editor")}
                >
                  {t("editorTab")}
                </button>
                <button
                  type="button"
                  className={`composer-mobile-tab ${mobilePane === "preview" ? "is-active" : ""}`}
                  onClick={() => setMobilePane("preview")}
                >
                  {t("previewTab")}
                </button>
              </div>

              <div className={`composer-builder-column composer-editor-column ${mobilePane === "preview" ? "is-hidden-mobile" : ""}`}>
                <section className="panel composer-section-card composer-step-card">
                  <div className="section-row composer-question-header">
                    <div>
                      <p className="eyebrow">Step 3</p>
                      <h2>{t("fields")}</h2>
                      <p className="muted">{t("questionCount", { count: fields.length })}</p>
                    </div>
                    <button type="button" className="ghost-button" onClick={() => addSection()}>
                      + {t("addSection")}
                    </button>
                  </div>

                  <SectionEditor
                    sections={sections}
                    onAddSection={addSection}
                    onUpdateSection={updateSection}
                    onRemoveSection={removeSection}
                  />

                  <div className="stack composer-question-stack">
                    {fields.map((field, index) => (
                      <FormFieldEditor
                        key={field.id}
                        field={field}
                        index={index}
                        sections={sections}
                        rootRef={(node) => {
                          fieldCardRefs.current[field.id] = node;
                        }}
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

                  {fields.length === 0 ? <p className="muted">{t("fieldEmptyState")}</p> : null}

                  <div className="composer-step-actions">
                    <button type="button" className="ghost-button" onClick={() => moveStep(-1)}>
                      {t("back")}
                    </button>
                    <button type="button" className="primary-button" onClick={handleFieldsContinue}>
                      {t("continue")}
                    </button>
                  </div>
                </section>
              </div>

              <div className={`composer-builder-column composer-preview-column ${mobilePane === "editor" ? "is-hidden-mobile" : ""}`}>
                <LivePreview
                  title={title}
                  description={description}
                  fields={fields}
                  sections={sections}
                  encryptSubmissions={encryptSubmissions}
                />
              </div>
            </section>
          ) : null}

          {currentStep === "publish" ? (
            <section className="composer-builder-grid composer-builder-grid-preview">
              <div className="composer-mobile-tabs" role="tablist" aria-label="Builder view">
                <button
                  type="button"
                  className={`composer-mobile-tab ${mobilePane === "editor" ? "is-active" : ""}`}
                  onClick={() => setMobilePane("editor")}
                >
                  {t("editorTab")}
                </button>
                <button
                  type="button"
                  className={`composer-mobile-tab ${mobilePane === "preview" ? "is-active" : ""}`}
                  onClick={() => setMobilePane("preview")}
                >
                  {t("previewTab")}
                </button>
              </div>

              <div className={`composer-builder-column composer-editor-column ${mobilePane === "preview" ? "is-hidden-mobile" : ""}`}>
                <section className="panel composer-section-card composer-publish-panel composer-step-card">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">Step 4</p>
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

                  <details className="composer-advanced-settings" open>
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

                      <section className="panel composer-settings-card">
                        <div className="section-row">
                          <div>
                            <p className="eyebrow">Proof-backed routing</p>
                            <h3>{t("storageAndSignatureTitle")}</h3>
                          </div>
                        </div>
                        <div className="composer-capability-list muted">
                          <p>{t("walrusStorageLine")}</p>
                          <p>{t("suiSignatureLine")}</p>
                        </div>
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

                  <div className="composer-step-actions">
                    <button type="button" className="ghost-button" onClick={() => moveStep(-1)}>
                      {t("back")}
                    </button>
                  </div>
                </section>
              </div>

              <div className={`composer-builder-column composer-preview-column ${mobilePane === "editor" ? "is-hidden-mobile" : ""}`}>
                <LivePreview
                  title={title}
                  description={description}
                  fields={fields}
                  sections={sections}
                  encryptSubmissions={encryptSubmissions}
                />
              </div>
            </section>
          ) : null}
        </form>

        {currentStep === "fields" ? (
          <button
            type="button"
            className="primary-button composer-floating-add"
            onClick={() => setFieldTypePickerOpen(true)}
          >
            + {t("addFieldFloating")}
          </button>
        ) : null}
      </section>
    </AdminAccessGate>
  );
}
