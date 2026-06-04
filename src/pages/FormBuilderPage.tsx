import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import "../styles/components/forms-content.css";
import "../styles/components/metadata-proof.css";
import "../styles/components/wallet-network.css";
import "../styles/pages/create-form.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/workspace.css";
import "../styles/mobile/wallet.css";
import "../styles/mobile/composer.css";
import "../styles/mobile/composer-review.css";
import "../styles/mobile/publish.css";
import "../styles/mobile/matrix.css";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { RecoverableDraftBanner } from "../components/RecoverableDraftBanner";
import { FieldTypePicker } from "../components/formBuilder/FieldTypePicker";
import { useAccessControl } from "../hooks/useAccessControl";
import { useProjectRegistry } from "../hooks/useProjectRegistry";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { canAdmin, getAdminSurfaceAccessState, getRoleLabel } from "../lib/adminAccess";
import { getActivityActorRole } from "../lib/activityLog";
import { normalizeForm } from "../lib/formSchema";
import { classifyFormEdit, isStructuralFormEdit, resolveFormVersion } from "../lib/formVersioning";
import { storageAdapter } from "../lib/storage";
import { setSelectedProjectId } from "../lib/projectRegistry";
import { shortAddress, WALRUS_UPLOAD_RELAY_URL } from "../lib/sui";
import { readManifestWithForm } from "../lib/walrus";
import { getInitialFields, getInitialTemplate, showWalrusDiagnostics } from "../features/createForm/constants";
import { BuilderToolbar } from "../features/createForm/components/BuilderToolbar";
import { FieldsStep } from "../features/createForm/components/FieldsStep";
import { InfoStep } from "../features/createForm/components/InfoStep";
import { IntentStartStep } from "../features/createForm/components/IntentStartStep";
import { MirrorPreviewPanel } from "../features/createForm/components/MirrorPreviewPanel";
import { PublishOverlay } from "../features/createForm/components/PublishOverlay";
import { PublishStep } from "../features/createForm/components/PublishStep";
import { TemplateStep } from "../features/createForm/components/TemplateStep";
import { getCreateFormEncryptionReadiness } from "../features/createForm/encryptionReadiness";
import { useCreateFormBuilder } from "../features/createForm/hooks/useCreateFormBuilder";
import { useCreateFormPublish } from "../features/createForm/hooks/useCreateFormPublish";
import type { DisplayMode } from "../features/createForm/types";
import { getStorageRuntimeStatus, subscribeStorageRuntime } from "../storage/storageFactory";
import {
  CREATE_FORM_DRAFT_STORAGE_KEY,
  CREATE_FORM_GUEST_DRAFT_STORAGE_KEY,
  parseStoredCreateFormDraft,
} from "../features/createForm/utils";
import type { FormSchema, Submission } from "../types";

type ComposerHomeSignalStatus = "draft" | "active" | "archived";

interface ComposerHomeSignal {
  id: string;
  title: string;
  status: ComposerHomeSignalStatus;
  responseCount?: number;
  lastEdited?: string;
  lastActivity?: string;
  href: string;
}

interface ComposerHomeDraft {
  key: string;
  title: string;
  mode: "admin" | "guestDraft";
  fieldCount: number;
  step: string;
}

interface ComposerHomeState {
  drafts: ComposerHomeDraft[];
  signals: ComposerHomeSignal[];
  error: string;
}

function formatRelativeSignalTime(value: string | undefined, t: ReturnType<typeof useI18n>["t"]) {
  if (!value) {
    return t("composerHomeActivityUnavailable");
  }
  const date = new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    return t("composerHomeActivityUnavailable");
  }
  const deltaMs = Date.now() - time;
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000));
  if (deltaMinutes < 1) {
    return t("composerHomeJustNow");
  }
  if (deltaMinutes < 60) {
    return t("composerHomeMinutesAgo", { count: deltaMinutes });
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return t("composerHomeHoursAgo", { count: deltaHours });
  }
  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 8) {
    return t("composerHomeDaysAgo", { count: deltaDays });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getFormStatus(form: FormSchema): ComposerHomeSignalStatus {
  if (form.activityEvents?.some((event) => event.action === "form_archived")) {
    return "archived";
  }
  return "active";
}

function getLatestFormActivity(form: FormSchema, submissions: Array<{ createdAt: string; updatedAt?: string }>) {
  return [form.updatedAt, form.createdAt, ...submissions.map((submission) => submission.updatedAt ?? submission.createdAt)]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0];
}

function readComposerHomeDrafts(t: ReturnType<typeof useI18n>["t"]): ComposerHomeDraft[] {
  if (typeof window === "undefined") {
    return [];
  }

  return [
    { key: CREATE_FORM_DRAFT_STORAGE_KEY, mode: "admin" as const },
    { key: CREATE_FORM_GUEST_DRAFT_STORAGE_KEY, mode: "guestDraft" as const },
  ].flatMap(({ key, mode }) => {
    try {
      const rawDraft = window.localStorage.getItem(key);
      if (!rawDraft) {
        return [];
      }
      const parsed = parseStoredCreateFormDraft(rawDraft);
      if (parsed.status !== "valid") {
        return [];
      }
      const title = parsed.draft.title?.trim() || t("composerHomeUntitledDraft");
      return [
        {
          key,
          mode,
          title,
          fieldCount: parsed.draft.fields?.length ?? 0,
          step: parsed.draft.currentStep ?? "fields",
        },
      ];
    } catch {
      return [];
    }
  });
}

function createNewSignalTarget() {
  return {
    pathname: "/create",
    search: `?fresh=${Date.now()}`,
  };
}

function ComposerHomeGlyph({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ? `composer-home-icon ${className}` : "composer-home-icon"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function ComposerHomeSectionIcon({ type }: { type: "drafts" | "signals" }) {
  if (type === "drafts") {
    return (
      <ComposerHomeGlyph>
        <path d="M8.25 5.25h5.7l3.8 3.85v9.65a2 2 0 0 1-2 2H8.25a2 2 0 0 1-2-2V7.25a2 2 0 0 1 2-2Z" />
        <path d="M13.75 5.5V9.3h3.75" />
        <path d="M8.9 14.1h6.2" />
        <path d="M8.9 17.1h4.7" />
      </ComposerHomeGlyph>
    );
  }

  return (
    <ComposerHomeGlyph>
      <circle cx="7.5" cy="7.75" r="2.35" />
      <circle cx="16.5" cy="16.25" r="2.35" />
      <path d="M9.6 8.85c2.5.7 4 2.3 4.75 5" />
      <path d="M6.1 10.05c-.7 1.95-.25 3.85 1.15 5.25" />
      <path d="M7.25 15.3H11" />
    </ComposerHomeGlyph>
  );
}

function ComposerHomeArrowIcon() {
  return (
    <ComposerHomeGlyph>
      <path d="m9 5.75 6.25 6.25L9 18.25" />
    </ComposerHomeGlyph>
  );
}

function ComposerHomeDocumentIcon() {
  return (
    <ComposerHomeGlyph>
      <path d="M7.25 4.75h6.4l3.1 3.25v11.25h-9.5Z" />
      <path d="M13.45 4.95v3.3h3.05" />
      <path d="M9.45 12.25h5.1" />
      <path d="M9.45 15.35h3.7" />
    </ComposerHomeGlyph>
  );
}

function getComposerHomeSignalInitials(title: string) {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  return (title.trim().slice(0, 2) || "DS").toUpperCase();
}

function getComposerHomeStatusLabel(status: ComposerHomeSignalStatus, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "active":
      return t("composerHomeStatusActive");
    case "archived":
      return t("composerHomeStatusArchived");
    case "draft":
      return t("composerHomeStatusDraft");
  }
}

function ComposerHomeSignalCard({ signal }: { signal: ComposerHomeSignal }) {
  const { t } = useI18n();

  return (
    <Link className="composer-home-signal-card" to={signal.href} aria-label={t("composerHomeEditSignalAria", { title: signal.title })}>
      <span className={`composer-home-signal-avatar is-${signal.status}`}>{getComposerHomeSignalInitials(signal.title)}</span>
      <div className="composer-home-card-main">
        <span className={`composer-home-status is-${signal.status}`}>{getComposerHomeStatusLabel(signal.status, t)}</span>
        <h3>{signal.title}</h3>
        <p className="muted">{t("composerHomeLastEdited", { time: formatRelativeSignalTime(signal.lastEdited, t) })}</p>
        <dl className="composer-home-signal-meta">
          <div>
            <dt>{t("composerHomeResponses")}</dt>
            <dd>{signal.responseCount === undefined ? t("composerHomeUnavailable") : signal.responseCount}</dd>
          </div>
          <div>
            <dt>{t("composerHomeLastActivity")}</dt>
            <dd>{formatRelativeSignalTime(signal.lastActivity, t)}</dd>
          </div>
        </dl>
      </div>
      <span className="composer-home-card-arrow">
        <ComposerHomeArrowIcon />
      </span>
    </Link>
  );
}

function ComposerHomeDraftCard({ draft }: { draft: ComposerHomeDraft }) {
  const { t } = useI18n();

  return (
    <Link
      className="composer-home-draft-card"
      to={{ pathname: "/create", search: draft.mode === "guestDraft" ? "?composer=1&mode=guestDraft" : "?composer=1" }}
      aria-label={t("composerHomeResumeDraftAria", { title: draft.title })}
    >
      <span className="composer-home-draft-icon">
        <ComposerHomeDocumentIcon />
      </span>
      <div className="composer-home-card-main">
        <span className="composer-home-status is-draft">{t("composerHomeStatusUnpublished")}</span>
        <h3>{draft.title}</h3>
        <p className="muted">{t("composerHomeDraftMeta", { count: draft.fieldCount, step: draft.step })}</p>
      </div>
      <span className="composer-home-draft-action">{t("composerHomeResumeEditing")}</span>
    </Link>
  );
}

function ComposerHomePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [state, setState] = useState<ComposerHomeState>({ drafts: [], signals: [], error: "" });
  const [loading, setLoading] = useState(true);
  const [signalViewMode, setSignalViewMode] = useState<"list" | "cards">("cards");

  useEffect(() => {
    let cancelled = false;
    async function loadComposerHome() {
      setLoading(true);
      const drafts = readComposerHomeDrafts(t);
      try {
        const forms = await storageAdapter.listForms();
        const signals = await Promise.all(
          forms.map(async (form) => {
            try {
              const submissions = await storageAdapter.listSubmissions(form.id);
              return {
                id: form.id,
                title: form.title?.trim() || t("composerHomeUntitledSignal"),
                status: getFormStatus(form),
                responseCount: submissions.length,
                lastEdited: form.updatedAt ?? form.createdAt,
                lastActivity: getLatestFormActivity(form, submissions),
                href: `/create?republishFormId=${encodeURIComponent(form.id)}`,
              } satisfies ComposerHomeSignal;
            } catch {
              return {
                id: form.id,
                title: form.title?.trim() || t("composerHomeUntitledSignal"),
                status: getFormStatus(form),
                lastEdited: form.updatedAt ?? form.createdAt,
                lastActivity: form.updatedAt ?? form.createdAt,
                href: `/create?republishFormId=${encodeURIComponent(form.id)}`,
              } satisfies ComposerHomeSignal;
            }
          }),
        );
        if (!cancelled) {
          setState({
            drafts,
            signals: signals.sort((left, right) => (right.lastEdited ?? "").localeCompare(left.lastEdited ?? "")),
            error: "",
          });
        }
      } catch (error) {
        console.warn("Failed to load Composer Home.", error);
        if (!cancelled) {
          setState({
            drafts,
            signals: [],
            error: t("composerHomeRegistryUnavailable"),
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadComposerHome();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const hasSignals = state.signals.length > 0;
  const hasDrafts = state.drafts.length > 0;

  return (
    <section className="composer-home-shell">
      <section className="composer-home-hero">
        <div className="composer-home-hero-copy">
          <p className="eyebrow">{t("composerHomeEyebrow")}</p>
          <h1>{t("composerHomeTitle")}</h1>
          <p className="muted">{t("composerHomeBody")}</p>
        </div>
        <button type="button" className="composer-home-create-card" onClick={() => navigate(createNewSignalTarget())}>
          <span className="composer-home-create-plus">+</span>
          <span>
            <strong>{t("composerHomeCreateSignal")}</strong>
            <small>{t("composerHomeCreateSignalHelp")}</small>
          </span>
          <span className="composer-home-create-arrow" aria-hidden="true">
            <ComposerHomeArrowIcon />
          </span>
        </button>
      </section>

      <section className="composer-home-grid" aria-busy={loading}>
        <section className="composer-home-section composer-home-drafts-section">
          <div className="composer-home-section-heading">
            <div className="composer-home-section-title">
              <span className="composer-home-section-icon">
                <ComposerHomeSectionIcon type="drafts" />
              </span>
              <h2>{t("composerHomeDraftsTitle")}</h2>
            </div>
            <span>{hasDrafts ? t("composerHomeDraftCount", { count: state.drafts.length }) : t("composerHomeNoDraft")}</span>
          </div>
          {loading ? <div className="composer-home-loading panel">{t("composerHomeRestoringDrafts")}</div> : null}
          {!loading && hasDrafts ? (
            <div className="composer-home-draft-list">
              {state.drafts.map((draft) => (
                <ComposerHomeDraftCard key={draft.key} draft={draft} />
              ))}
            </div>
          ) : null}
          {!loading && !hasDrafts ? (
            <div className="composer-home-empty panel">
              <strong>{t("composerHomeNoDraftsTitle")}</strong>
              <p className="muted">{t("composerHomeNoDraftsBody")}</p>
            </div>
          ) : null}
        </section>

        <section className="composer-home-section composer-home-signals-section">
          <div className="composer-home-section-heading">
            <div className="composer-home-section-title">
              <span className="composer-home-section-icon">
                <ComposerHomeSectionIcon type="signals" />
              </span>
              <h2>{t("composerHomeSignalsTitle")}</h2>
            </div>
            <div className="composer-home-list-tools">
              <span>{t("composerHomeSortLatestEdited")}</span>
              <div className="composer-home-view-toggle" role="group" aria-label={t("composerHomeSignalsTitle")}>
                <button
                  type="button"
                  className={signalViewMode === "list" ? "is-active" : ""}
                  aria-label={t("composerHomeListView")}
                  aria-pressed={signalViewMode === "list"}
                  title={t("composerHomeListView")}
                  onClick={() => setSignalViewMode("list")}
                />
                <button
                  type="button"
                  className={signalViewMode === "cards" ? "is-active" : ""}
                  aria-label={t("composerHomeCardView")}
                  aria-pressed={signalViewMode === "cards"}
                  title={t("composerHomeCardView")}
                  onClick={() => setSignalViewMode("cards")}
                />
              </div>
            </div>
          </div>
          {state.error ? <p className="composer-home-warning">{state.error}</p> : null}
          <div className={`composer-home-signal-list is-${signalViewMode}`}>
            {loading ? <div className="composer-home-loading panel">{t("composerHomeScanningRegistry")}</div> : null}
            {!loading && hasSignals ? state.signals.map((signal) => <ComposerHomeSignalCard key={signal.id} signal={signal} />) : null}
            {!loading && !hasSignals ? (
              <div className="composer-home-empty panel">
                <strong>{t("composerHomeNoSignalsTitle")}</strong>
                <p className="muted">{t("composerHomeNoSignalsBody")}</p>
                <button type="button" className="primary-button" onClick={() => navigate(createNewSignalTarget())}>
                  + {t("composerHomeCreateSignal")}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </section>
  );
}

function normalizeFieldsForModeSwitch(
  fields: Array<{
    type: string;
    label: string;
    helpText?: string;
    placeholder?: string;
    required: boolean;
    options?: string[];
    rows?: string[];
    columns?: string[];
  }>,
) {
  return fields.map((field) => ({
    type: field.type,
    label: field.label.trim(),
    description: field.helpText?.trim() ?? "",
    placeholder: field.placeholder?.trim() ?? "",
    required: field.required,
    options: field.options?.map((option) => option.trim()).filter(Boolean) ?? [],
    rows: field.rows?.map((row) => row.trim()).filter(Boolean) ?? [],
    columns: field.columns?.map((column) => column.trim()).filter(Boolean) ?? [],
  }));
}

interface FormBuilderComposerProps {
  mode: "admin" | "guestDraft";
  freshStartToken: string;
  republishFormId?: string;
  republishManifest?: string;
  initialDisplayMode?: DisplayMode;
  draftSeed: {
    templateKey?: string;
    idea?: string;
  };
}

function FormBuilderComposer({
  mode,
  freshStartToken,
  republishFormId,
  republishManifest,
  initialDisplayMode = "classic",
  draftSeed,
}: FormBuilderComposerProps) {
  const { t, language } = useI18n();
  const wallet = useSuiWallet();
  const suiClient = useSuiClient();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(wallet.accountAddress);
  const { projects } = useProjectRegistry(wallet.accountAddress);
  const createFormTx = useSignAndExecuteTransaction();
  const composerShellRef = useRef<HTMLElement | null>(null);
  const pendingTemplateScrollRef = useRef(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [storageRuntime, setStorageRuntime] = useState(() => getStorageRuntimeStatus());
  const [showPublishSuccessView, setShowPublishSuccessView] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialDisplayMode);
  const [showMirrorStartChoice, setShowMirrorStartChoice] = useState(false);
  const [editingForm, setEditingForm] = useState<FormSchema | null>(null);
  const [editSubmissions, setEditSubmissions] = useState<Submission[]>([]);
  const [editLoadError, setEditLoadError] = useState("");
  const [editLoadStatus, setEditLoadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const versionConfirmRef = useRef(false);
  const isMirrorMode = displayMode === "mirror";
  const hasAdminAccess = canAdmin(capabilityProfile);
  const isGuestDraftMode = mode === "guestDraft";
  const localizedInitialTemplate = useMemo(() => getInitialTemplate(language), [language]);
  const localizedInitialFields = useMemo(() => getInitialFields(language), [language]);

  const builder = useCreateFormBuilder({
    t,
    language,
    projects,
    freshStartToken,
    mode: isGuestDraftMode ? "guestDraft" : "admin",
    startExperience: initialDisplayMode,
    draftSeed,
  });
  const selectedProjectForPublish = hasAdminAccess ? builder.selectedProject : null;
  const publish = useCreateFormPublish({
    t,
    accountAddress: wallet.accountAddress,
    actorRole: getActivityActorRole(capabilityProfile),
    creationMode: isGuestDraftMode ? "guest" : "admin",
    title: builder.values.title,
    description: builder.values.description,
    headerImage: builder.values.headerImage,
    headerLogo: builder.values.headerLogo,
    fields: builder.values.fields,
    sections: builder.values.sections,
    purpose: builder.values.purpose,
    analysisProfileId: builder.values.analysisProfileId,
    signalType: builder.values.signalType,
    analystType: builder.values.analystType,
    analysisType: builder.values.analysisType,
    visibility: builder.values.visibility,
    identityPolicy: builder.values.identityPolicy,
    accessMode: builder.values.accessMode,
    nftGate: builder.values.nftGate,
    locationRequirement: builder.values.locationRequirement,
    processingMode: builder.values.processingMode,
    encryptSubmissions: builder.values.encryptSubmissions,
    responseOpenAtCustom: builder.values.responseOpenAtCustom,
    responseDeadlinePreset: builder.values.responseDeadlinePreset,
    responseDeadlineCustomAt: builder.values.responseDeadlineCustomAt,
    isDirty: builder.isDirty,
    selectedProject: selectedProjectForPublish,
    editingForm,
    setProjectState: builder.setProjectState,
    signAndExecuteTransaction: async (transaction) => createFormTx.mutateAsync({ transaction }),
    waitForTransaction: async (digest) =>
      suiClient.waitForTransaction({
        digest,
        options: { showEvents: true },
      }),
    validateFieldsStep: builder.validateFieldsStep,
    goToStep: builder.goToStep,
    onSaved: () => builder.markSaved(),
  });

  const accessState = getAdminSurfaceAccessState("admin", wallet.accountAddress, capabilityProfile);
  const showComposerChrome = !publish.savedForm;
  const editSubmissionCount = editSubmissions.length;
  const editSubmissionCountsByVersion = useMemo(() => {
    const counts = new Map<number, number>();
    editSubmissions.forEach((submission) => {
      const version = resolveFormVersion({ formVersion: submission.formVersion });
      counts.set(version, (counts.get(version) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([left], [right]) => left - right);
  }, [editSubmissions]);
  const editCandidateForm = useMemo<FormSchema | null>(() => {
    if (!editingForm) {
      return null;
    }
    return {
      ...editingForm,
      title: builder.values.title,
      description: builder.values.description,
      headerImage: builder.values.headerImage.url ? builder.values.headerImage : undefined,
      headerLogo: builder.values.headerLogo.url ? builder.values.headerLogo : undefined,
      fields: builder.values.fields,
      sections: builder.values.sections,
      purpose: builder.values.purpose,
      analysisProfileId: builder.values.analysisProfileId,
      signalType: builder.values.signalType,
      analystType: builder.values.analystType,
      analysisType: builder.values.analysisType,
      visibility: builder.values.visibility,
      identityPolicy: builder.values.identityPolicy,
      accessMode: builder.values.accessMode,
      nftGate: builder.values.accessMode === "nft_required" ? builder.values.nftGate : undefined,
      locationRequirement: builder.values.locationRequirement,
      processingMode: builder.values.processingMode,
      encryptSubmissions: builder.values.encryptSubmissions,
      publicExplore: builder.values.visibility === "public",
      updatedAt: new Date().toISOString(),
    };
  }, [
    builder.values.description,
    builder.values.encryptSubmissions,
    builder.values.fields,
    builder.values.headerImage,
    builder.values.headerLogo,
    builder.values.identityPolicy,
    builder.values.accessMode,
    builder.values.locationRequirement,
    builder.values.nftGate,
    builder.values.processingMode,
    builder.values.purpose,
    builder.values.analysisProfileId,
    builder.values.signalType,
    builder.values.analystType,
    builder.values.analysisType,
    builder.values.sections,
    builder.values.title,
    builder.values.visibility,
    editingForm,
  ]);
  const editDiff = useMemo(
    () => (editingForm && editCandidateForm ? classifyFormEdit(editingForm, editCandidateForm) : null),
    [editCandidateForm, editingForm],
  );
  const willPublishNewVersion = Boolean(
    editingForm && editSubmissionCount > 0 && editCandidateForm && isStructuralFormEdit(editingForm, editCandidateForm),
  );

  const completedSteps = useMemo(
    () =>
      [
        builder.values.selectedTemplateKey && builder.values.currentStep !== "template" ? "template" : "",
        builder.hasValidTitle && ["fields", "publish"].includes(builder.values.currentStep) ? "info" : "",
        builder.hasQuestions && builder.values.currentStep === "publish" ? "fields" : "",
        publish.savedForm ? "publish" : "",
      ].filter(Boolean),
    [builder.hasQuestions, builder.hasValidTitle, builder.values.currentStep, builder.values.selectedTemplateKey, publish.savedForm],
  );
  const encryptionWarnings = getCreateFormEncryptionReadiness({
    encryptSubmissions: builder.values.encryptSubmissions,
    projectId: selectedProjectForPublish?.objectId,
    ownerAddress: wallet.accountAddress,
  });
  const draftStateLabel = useMemo(() => {
    if (!builder.isDirty && publish.savedForm) {
      return t("draftClearedAfterPublish");
    }
    switch (builder.draftSaveState) {
      case "restored":
        return t("draftRestored");
      case "saving":
        return t("draftSaving");
      case "saved":
        return t("draftSaved");
      default:
        return builder.isDirty ? t("draftUnsaved") : "";
    }
  }, [builder.draftSaveState, builder.isDirty, publish.savedForm, t]);
  const hasEditedCoreSignal = useMemo(() => {
    const titleChanged = builder.values.title.trim() !== localizedInitialTemplate.title.trim();
    const descriptionChanged = builder.values.description.trim() !== localizedInitialTemplate.description.trim();
    const fieldsChanged =
      JSON.stringify(normalizeFieldsForModeSwitch(builder.values.fields)) !==
      JSON.stringify(normalizeFieldsForModeSwitch(localizedInitialFields));
    return titleChanged || descriptionChanged || fieldsChanged;
  }, [builder.values.description, builder.values.fields, builder.values.title, localizedInitialFields, localizedInitialTemplate.description, localizedInitialTemplate.title]);

  useEffect(() => {
    const unsubscribe = subscribeStorageRuntime(() => setStorageRuntime(getStorageRuntimeStatus()));
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!republishFormId && !republishManifest) {
      setEditingForm(null);
      setEditSubmissions([]);
      setEditLoadStatus("idle");
      setEditLoadError("");
      return;
    }

    let cancelled = false;
    setEditLoadStatus("loading");
    setEditLoadError("");

    async function loadFormForEdit() {
      try {
        let nextForm: FormSchema | null = null;
        if (republishManifest) {
          const carrier = await readManifestWithForm(republishManifest);
          nextForm = carrier.form ? normalizeForm(carrier.form) : null;
        }
        if (!nextForm && republishFormId) {
          nextForm = await storageAdapter.getForm(republishFormId);
        }
        if (!nextForm) {
          throw new Error("The published signal could not be restored into the builder.");
        }
        const normalizedForm = normalizeForm(nextForm);
        const submissions = await storageAdapter.listSubmissions(normalizedForm.id).catch(() => []);
        if (cancelled) {
          return;
        }
        setEditingForm(normalizedForm);
        setEditSubmissions(submissions);
        builder.applyFormForEdit(normalizedForm);
        setEditLoadStatus("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to restore the published signal.";
        setEditingForm(null);
        setEditSubmissions([]);
        setEditLoadError(message);
        setEditLoadStatus("error");
      }
    }

    void loadFormForEdit();
    return () => {
      cancelled = true;
    };
    // The edit loader should run only when the requested published form changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [republishFormId, republishManifest]);

  useEffect(() => {
    if (publish.overlay.open) {
      setShowPublishSuccessView(false);
      return;
    }
    if (!publish.savedForm || builder.isDirty) {
      setShowPublishSuccessView(false);
    }
  }, [builder.isDirty, publish.overlay.open, publish.savedForm]);

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
    if (!freshStartToken) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const composerShell = composerShellRef.current;
      if (!composerShell) {
        return;
      }
      const topbarHeight = document.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect().height ?? 0;
      const nextTop = Math.max(
        0,
        window.scrollY + composerShell.getBoundingClientRect().top - topbarHeight - 12,
      );
      window.scrollTo({ top: nextTop, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [freshStartToken]);

  useEffect(() => {
    if (builder.values.currentStep !== "template" || !pendingTemplateScrollRef.current) {
      return;
    }
    pendingTemplateScrollRef.current = false;
    const frameId = window.requestAnimationFrame(() => {
      const quickSignalSection = document.getElementById("quick-signal-section");
      if (!quickSignalSection) {
        return;
      }
      const topbarHeight = document.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect().height ?? 0;
      const nextTop = Math.max(0, window.scrollY + quickSignalSection.getBoundingClientRect().top - topbarHeight - 24);
      window.scrollTo({ top: nextTop, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [builder.values.currentStep]);

  function handleFieldsContinue() {
    publish.setError("");
    const validation = builder.validateFieldsStep();
    if (!validation.isValid) {
      publish.setError(validation.error);
      return;
    }
    builder.moveStep(1);
  }

  function handleSelectProject(projectId: string) {
    builder.setSelectedProjectIdState(projectId);
    if (!isGuestDraftMode) {
      setSelectedProjectId(projectId);
    }
  }

  function handleApplyIntentDraft(draft: Parameters<typeof builder.applyIntentDraft>[0]) {
    setShowMirrorStartChoice(false);
    builder.applyIntentDraft(draft);
  }

  function switchDisplayMode(nextMode: DisplayMode) {
    if (nextMode === "classic") {
      setDisplayMode("classic");
      setShowMirrorStartChoice(false);
      return;
    }

    setDisplayMode("mirror");
    if (editingForm) {
      setShowMirrorStartChoice(false);
      return;
    }
    if (hasEditedCoreSignal) {
      setShowMirrorStartChoice(true);
      return;
    }

    setShowMirrorStartChoice(false);
    builder.goToStep("template");
  }

  function handleStartMirrorFromIntent() {
    setShowMirrorStartChoice(false);
    if (editingForm) {
      return;
    }
    builder.goToStep("template");
  }

  function handleContinueCurrentSignal() {
    setShowMirrorStartChoice(false);
  }

  function handleSelectStep(step: typeof builder.values.currentStep) {
    if (editingForm && step === "template") {
      return;
    }
    if (step === "template") {
      pendingTemplateScrollRef.current = true;
    }
    builder.goToStep(step);
  }

  function handleBuilderSubmit(event: FormEvent<HTMLFormElement>) {
    if (willPublishNewVersion && !versionConfirmRef.current) {
      event.preventDefault();
      setVersionModalOpen(true);
      return;
    }
    versionConfirmRef.current = false;
    void publish.handleSubmit(event);
  }

  function confirmPublishNewVersion() {
    versionConfirmRef.current = true;
    setVersionModalOpen(false);
    window.setTimeout(() => {
      document.getElementById("create-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }, 0);
  }

  if (!isGuestDraftMode && wallet.accountAddress && isLoadingAccess) {
    return <div className="panel">{t("checkingWalletCapabilities")}</div>;
  }

  const builderForm = (
    <form id="create-form" className="composer-stage composer-step-stage" onSubmit={handleBuilderSubmit}>
      {builder.values.currentStep === "template" ? (
        isMirrorMode ? (
          <IntentStartStep onApplyDraft={handleApplyIntentDraft} />
        ) : (
          <TemplateStep
            t={t}
            selectedTemplateKey={builder.values.selectedTemplateKey}
            onSelectTemplate={builder.applyTemplate}
          />
        )
      ) : null}

      {builder.values.currentStep === "info" ? (
        <InfoStep
          t={t}
          title={builder.values.title}
          description={builder.values.description}
          identityPolicy={builder.values.identityPolicy}
          locationRequirement={builder.values.locationRequirement}
          processingMode={builder.values.processingMode}
          encryptSubmissions={builder.values.encryptSubmissions}
          headerImage={builder.values.headerImage}
          headerLogo={builder.values.headerLogo}
          setTitle={builder.setTitle}
          setDescription={builder.setDescription}
          setHeaderImage={builder.setHeaderImage}
          setHeaderLogo={builder.setHeaderLogo}
          setProcessingMode={builder.setProcessingMode}
          onBack={() => {
            if (!editingForm) {
              builder.moveStep(-1);
            }
          }}
          onContinue={() => builder.moveStep(1)}
          backDisabled={Boolean(editingForm)}
        />
      ) : null}

      {builder.values.currentStep === "fields" ? (
        <FieldsStep
          t={t}
          title={builder.values.title}
          description={builder.values.description}
          fields={builder.values.fields}
          sections={builder.values.sections}
          encryptSubmissions={builder.values.encryptSubmissions}
          draggedFieldId={builder.values.draggedFieldId}
          dragOverFieldId={builder.values.dragOverFieldId}
          dragOverPlacement={builder.values.dragOverPlacement}
          refs={builder.refs}
          setActiveFieldId={builder.setActiveFieldId}
          setDraggedFieldId={builder.setDraggedFieldId}
          setDragOverFieldId={builder.setDragOverFieldId}
          setDragOverPlacement={builder.setDragOverPlacement}
          onAddSection={builder.addSection}
          onUpdateSection={builder.updateSection}
          onRemoveSection={builder.removeSection}
          onUpdateField={builder.updateField}
          onRemoveField={builder.removeField}
          onDuplicateField={builder.duplicateFieldAt}
          onInsertConditionalField={builder.insertConditionalField}
          onInsertField={builder.insertField}
          onReorderFields={builder.reorderFields}
          onOpenFieldTypePicker={() => builder.setFieldTypePickerOpen(true)}
          onBack={() => builder.moveStep(-1)}
          onContinue={handleFieldsContinue}
          displayMode={displayMode}
        />
      ) : null}

      {builder.values.currentStep === "publish" ? (
        <PublishStep
          t={t}
          saving={publish.saving}
          registeringOnSui={publish.registeringOnSui}
          error={publish.error}
          failure={publish.failure}
          diagnosticsCopied={publish.diagnosticsCopied}
          savedForm={publish.savedForm}
          title={builder.values.title}
          description={builder.values.description}
          headerImage={builder.values.headerImage}
          headerLogo={builder.values.headerLogo}
          fields={builder.values.fields}
          sections={builder.values.sections}
          analysisProfileId={builder.values.analysisProfileId}
          signalType={builder.values.signalType}
          analystType={builder.values.analystType}
          analysisType={builder.values.analysisType}
          visibility={builder.values.visibility}
          identityPolicy={builder.values.identityPolicy}
          accessMode={builder.values.accessMode}
          nftGate={builder.values.nftGate}
          locationRequirement={builder.values.locationRequirement}
          encryptSubmissions={builder.values.encryptSubmissions}
          responseOpenAtCustom={builder.values.responseOpenAtCustom}
          responseDeadlinePreset={builder.values.responseDeadlinePreset}
          responseDeadlineCustomAt={builder.values.responseDeadlineCustomAt}
          mobilePane={builder.values.mobilePane}
          isReadyToPublish={builder.isReadyToPublish}
          publicPath={publish.publicPath}
          publicUrl={publish.publicUrl}
          publishChecks={publish.publishChecks}
          encryptionWarnings={encryptionWarnings}
          showPublishSuccessView={showPublishSuccessView}
          showWalrusDiagnostics={showWalrusDiagnostics}
          isGuestDraftMode={isGuestDraftMode}
          isConnected={wallet.isConnected}
          currentWalletName={wallet.walletName}
          accountAddress={wallet.accountAddress}
          storageMode={import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay"}
          uploadRelayUrl={WALRUS_UPLOAD_RELAY_URL || t("notConfigured")}
          storageRuntimeMode={storageRuntime.mode}
          storageRuntimeNotice={storageRuntime.notice ?? undefined}
          storageRuntimeDiagnostics={storageRuntime.diagnostics}
          walrusCostEstimate={publish.walrusCostEstimate}
          displayMode={displayMode}
          canManageProjects={hasAdminAccess}
          selectedProjectId={builder.values.selectedProjectId}
          selectedProject={hasAdminAccess ? builder.selectedProject : null}
          projects={hasAdminAccess ? projects : []}
          projectState={builder.values.projectState}
          selectedTemplateKey={builder.values.selectedTemplateKey}
          onSetMobilePane={builder.setMobilePane}
          onSelectProject={handleSelectProject}
          onChangeVisibility={builder.setVisibility}
          onChangeIdentityPolicy={builder.setIdentityPolicy}
          onChangeAccessMode={builder.setAccessModeState}
          onChangeNftGatePreset={builder.setNftGatePresetState}
          onChangeNftGate={builder.updateNftGateState}
          onChangeLocationRequirement={builder.setLocationRequirement}
          onToggleEncryptSubmissions={builder.setEncryptSubmissions}
          onChangeResponseOpenAtCustom={builder.setResponseOpenAtCustom}
          onChangeResponseDeadlinePreset={builder.setResponseDeadlinePreset}
          onChangeResponseDeadlineCustomAt={builder.setResponseDeadlineCustomAt}
          onRegisterOnSui={() => void publish.handleRegisterOnSui()}
          onCopyDiagnostics={() => void publish.copyDiagnostics()}
          onBack={() => builder.moveStep(-1)}
        />
      ) : null}
    </form>
  );

  const composer = (
      <section ref={composerShellRef} className="composer-shell">
        <PublishOverlay
          t={t}
          open={publish.overlay.open}
          overlay={publish.overlay}
          saving={publish.saving}
          title={builder.values.title}
          description={builder.values.description}
          fieldsCount={builder.values.fields.length}
          encryptSubmissions={builder.values.encryptSubmissions}
          purpose={builder.values.purpose}
          publicPath={publish.publicPath}
          publicUrl={publish.publicUrl}
          isCrossDeviceShareReady={publish.isCrossDeviceShareReady}
          onCopyLink={publish.handleCopyLink}
          onCopyBlobId={publish.handleCopyBlobId}
          onClose={() => {
            publish.setOverlay((current) => ({ ...current, open: false }));
            if (publish.savedForm) {
              setShowPublishSuccessView(true);
            }
          }}
        />

        <FieldTypePicker
          open={builder.values.fieldTypePickerOpen}
          onClose={() => builder.setFieldTypePickerOpen(false)}
          onPick={(type) => builder.insertField(type)}
        />

        {showComposerChrome ? (
          <>
            <BuilderToolbar
              t={t}
              isScrolled={isScrolled}
              currentStep={builder.values.currentStep}
              completedSteps={completedSteps}
              disabledSteps={editingForm ? ["template"] : undefined}
              capabilityConfigured={!isGuestDraftMode && capabilityProfile.isConfigured}
              accessRoleLabel={isGuestDraftMode ? t("guestDraftRole") : getRoleLabel(capabilityProfile)}
              adminCapLabel={!isGuestDraftMode && hasAdminAccess && capabilityProfile.adminCapIds[0] ? shortAddress(capabilityProfile.adminCapIds[0]) : undefined}
              draftStateLabel={draftStateLabel || undefined}
              savedFormId={publish.savedForm?.id}
              savedManifestBlobId={publish.savedForm?.manifestBlobId}
              onSelectStep={handleSelectStep}
            />

            <section className="panel composer-view-mode-panel" aria-label="Create Signal display mode">
              <div>
                <p className="eyebrow">Display Mode</p>
                <strong>{isMirrorMode ? "Mirror Preview Mode" : "Classic Builder"}</strong>
              </div>
              <div className="composer-view-mode-toggle" role="group" aria-label="Switch Create Signal display mode">
                <button
                  type="button"
                  className={displayMode === "classic" ? "is-active" : ""}
                  onClick={() => switchDisplayMode("classic")}
                >
                  Classic
                </button>
                <button
                  type="button"
                  className={displayMode === "mirror" ? "is-active" : ""}
                  onClick={() => switchDisplayMode("mirror")}
                >
                  Mirror
                </button>
              </div>
            </section>
          </>
        ) : null}

        {isMirrorMode && showMirrorStartChoice ? (
          <section className="panel mirror-start-choice-panel" aria-live="polite">
            <div>
              <p className="eyebrow">Mirror Start</p>
              <strong>Continue with current signal or start from intent?</strong>
              <span>
                We found existing title, description, or block edits. Mirror Mode will not reset them unless you choose
                the intent start.
              </span>
            </div>
            <div className="mirror-start-choice-actions">
              <button type="button" className="primary-button" onClick={handleContinueCurrentSignal}>
                Continue with current signal
              </button>
              <button type="button" className="ghost-button" onClick={handleStartMirrorFromIntent}>
                Start from intent
              </button>
            </div>
          </section>
        ) : null}

        {builder.hasRecoverableDraft ? (
          <RecoverableDraftBanner
            title={t("recoverableDraftTitle")}
            description={builder.draftParseNotice || undefined}
            restoreLabel={t("restore")}
            discardLabel={t("discard")}
            onRestore={builder.restoreRecoverableDraft}
            onDiscard={builder.discardRecoverableDraft}
          />
        ) : null}

        {builder.draftParseStatus === "invalid" ? (
          <RecoverableDraftBanner
            title="Draft recovery needs attention"
            description={builder.draftParseNotice}
            discardLabel={t("discard")}
            onDiscard={builder.discardRecoverableDraft}
          />
        ) : null}

        {isGuestDraftMode ? (
          <section className="composer-guest-draft-banner">
            <strong>{t("guestDraftBannerTitle")}</strong>
            <span>{t("guestDraftBannerBody")}</span>
          </section>
        ) : null}

        {editLoadStatus === "loading" ? (
          <section className="panel composer-version-panel" aria-live="polite">
            <p className="eyebrow">Signal Version</p>
            <strong>Restoring published signal...</strong>
            <span className="muted">DeepSignal is loading the current form and response counts before editing.</span>
          </section>
        ) : null}

        {editLoadStatus === "error" ? (
          <section className="panel composer-version-panel" aria-live="assertive">
            <p className="eyebrow">Signal Version</p>
            <strong>Published signal could not be restored</strong>
            <span className="muted">{editLoadError}</span>
          </section>
        ) : null}

        {editingForm ? (
          <section className="panel composer-version-panel" aria-live="polite">
            <div>
              <p className="eyebrow">Signal Version</p>
              <strong>
                Editing v{resolveFormVersion(editingForm)}
                {editSubmissionCount > 0 ? ` with ${editSubmissionCount} response${editSubmissionCount === 1 ? "" : "s"}` : ""}
              </strong>
              <span className="muted">
                {editSubmissionCount === 0
                  ? "No responses yet. Question structure can still be updated in place."
                  : willPublishNewVersion
                    ? "New version として公開します"
                    : editDiff?.classification === "none"
                      ? "No version-impacting changes yet."
                    : "Light edits will save on the current version."}
              </span>
            </div>
            {editSubmissionCountsByVersion.length ? (
              <div className="composer-version-counts" aria-label="Response counts by version">
                {editSubmissionCountsByVersion.map(([version, count]) => (
                  <span key={version} className="composer-version-pill">
                    v{version}: {count}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {versionModalOpen ? (
          <div className="composer-modal" role="dialog" aria-modal="true" aria-labelledby="version-up-title">
            <div className="composer-modal-backdrop" onClick={() => setVersionModalOpen(false)} />
            <div className="composer-modal-panel">
              <p className="eyebrow">Signal Version</p>
              <h2 id="version-up-title">New version として公開します</h2>
              <p className="muted">
                Existing v{resolveFormVersion(editingForm ?? undefined)} responses will remain attached to their
                original question structure. This publish creates the next version for future responses.
              </p>
              <div className="composer-version-counts" aria-label="Current response counts by version">
                {editSubmissionCountsByVersion.map(([version, count]) => (
                  <span key={version} className="composer-version-pill">
                    v{version}: {count}
                  </span>
                ))}
              </div>
              <div className="composer-modal-actions">
                <button type="button" className="ghost-button" onClick={() => setVersionModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={confirmPublishNewVersion}>
                  Publish new version
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isMirrorMode ? (
          <div className="composer-mirror-layout">
            <div className="composer-mirror-builder">{builderForm}</div>
            <MirrorPreviewPanel
              values={builder.values}
              activeFieldId={builder.values.activeFieldId}
              isReadyToPublish={builder.isReadyToPublish}
              publishedStatus={publish.savedForm ? "published" : "preview"}
              surface={builder.values.currentStep === "publish" ? "publish" : "builder"}
              savedForm={publish.savedForm}
              publicUrl={publish.publicUrl}
              publicPath={publish.publicPath}
              storageRuntimeMode={storageRuntime.mode}
              storageRuntimeNotice={storageRuntime.notice ?? undefined}
              storageRuntimeDiagnostics={storageRuntime.diagnostics}
              walrusCostEstimate={publish.walrusCostEstimate}
              saving={publish.saving}
              registeringOnSui={publish.registeringOnSui}
              publishError={publish.error}
              publishFailure={publish.failure}
              onCopyLink={publish.handleCopyLink}
            />
          </div>
        ) : (
          builderForm
        )}
      </section>
  );

  if (isGuestDraftMode) {
    return composer;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(wallet.accountAddress)}
      access={accessState}
      deniedBody={
        capabilityProfile.isConfigured
          ? t("formComposerDeniedBody")
          : undefined
      }
    >
      {composer}
    </AdminAccessGate>
  );
}

interface FormBuilderRouteContentProps {
  draftSeed: {
    templateKey?: string;
    idea?: string;
  };
  freshStartToken: string;
  initialDisplayMode: DisplayMode;
  republishFormId?: string;
  republishManifest?: string;
  requestedGuestDraftMode: boolean;
}

function FormBuilderRouteContent({
  draftSeed,
  freshStartToken,
  initialDisplayMode,
  republishFormId,
  republishManifest,
  requestedGuestDraftMode,
}: FormBuilderRouteContentProps) {
  const wallet = useSuiWallet();
  const { t } = useI18n();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(wallet.accountAddress, {
    enabled: !requestedGuestDraftMode,
  });
  const hasAdminAccess = canAdmin(capabilityProfile);

  if (!requestedGuestDraftMode && !wallet.accountAddress) {
    return <AdminAccessGate hasWallet={false} access="allowed" />;
  }

  if (!requestedGuestDraftMode && wallet.accountAddress && isLoadingAccess) {
    return <div className="panel">{t("checkingWalletCapabilities")}</div>;
  }

  const mode =
    requestedGuestDraftMode ||
    !wallet.accountAddress ||
    (capabilityProfile.isConfigured && !hasAdminAccess)
      ? "guestDraft"
      : "admin";

  return (
    <FormBuilderComposer
      key={`${mode}:${freshStartToken || republishFormId || republishManifest || "restored"}`}
      mode={mode}
      freshStartToken={freshStartToken}
      republishFormId={republishFormId}
      republishManifest={republishManifest}
      initialDisplayMode={initialDisplayMode}
      draftSeed={draftSeed}
    />
  );
}

export function FormBuilderPage({ initialSurface = "home" }: { initialSurface?: "home" | "composer" }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const requestedGuestDraftMode = searchParams.get("mode") === "guestDraft";
  const freshStartToken = searchParams.get("fresh") ?? "";
  const republishFormId = searchParams.get("republishFormId") ?? undefined;
  const republishManifest = searchParams.get("republishManifest") ?? undefined;
  const requestedComposer = searchParams.get("composer") === "1";
  const initialDisplayMode: DisplayMode = searchParams.get("preview") === "mirror" ? "mirror" : "classic";
  const draftSeed = {
    templateKey: searchParams.get("template") ?? undefined,
    idea: searchParams.get("idea") ?? undefined,
  };

  if (initialSurface === "home" && !freshStartToken && !requestedComposer && !republishFormId && !republishManifest) {
    return <ComposerHomePage />;
  }

  return (
    <FormBuilderRouteContent
      draftSeed={draftSeed}
      freshStartToken={freshStartToken}
      initialDisplayMode={initialDisplayMode}
      republishFormId={republishFormId}
      republishManifest={republishManifest}
      requestedGuestDraftMode={requestedGuestDraftMode}
    />
  );
}
