import { useMemo } from "react";
import { useI18n } from "../../../i18n";
import type { CriticalFailure } from "../../../lib/criticalFailure";
import { isLongTextLikeField } from "../../../lib/fieldTypes";
import type { WalrusCostEstimate } from "../../../storage/walrusCostEstimate";
import type { WalrusFailureDetails } from "../../../storage/walrusDiagnostics";
import { getOrderedFields } from "../../../utils/formLogic";
import type { FieldType, FormBuilderValues, FormField, FormSection, PreparedPublishForm } from "../types";

interface MirrorPreviewPanelProps {
  values: FormBuilderValues;
  activeFieldId?: string;
  isReadyToPublish?: boolean;
  publishedStatus?: "preview" | "published";
  surface?: "builder" | "publish";
  savedForm?: PreparedPublishForm | null;
  publicUrl?: string;
  publicPath?: string;
  storageRuntimeMode?: string;
  storageRuntimeNotice?: string;
  storageRuntimeDiagnostics?: WalrusFailureDetails | null;
  walrusCostEstimate?: WalrusCostEstimate | null;
  saving?: boolean;
  registeringOnSui?: boolean;
  publishError?: string;
  publishFailure?: CriticalFailure | null;
  onCopyLink?: () => void;
}

interface MirrorPreviewState {
  activeField?: FormField;
  activeFieldIndex: number;
  activeSectionName: string;
  activeBranchInfo: string;
  fieldCount: number;
  requiredCount: number;
  title: string;
  description: string;
  titleFallback: string;
  descriptionFallback: string;
  markdownSupported: boolean;
  mediaSupported: boolean;
  hasConditionalLogic: boolean;
  isPrivate: boolean;
  isReadyToPublish: boolean;
  publishedStatus: "preview" | "published";
  visibilityLabel: string;
  identityPolicyLabel: string;
  signalModeLabel: string;
}

interface MirrorBadge {
  label: string;
  tone?: "default" | "active" | "private" | "media" | "warning";
}

type SignalObjectStatus = "draft" | "ready" | "publishing" | "published" | "failed";

interface MirrorRuntimeState {
  savedForm?: PreparedPublishForm | null;
  publicUrl?: string;
  publicPath?: string;
  storageRuntimeMode?: string;
  storageRuntimeNotice?: string;
  storageRuntimeDiagnostics?: WalrusFailureDetails | null;
  walrusCostEstimate?: WalrusCostEstimate | null;
  saving: boolean;
  registeringOnSui: boolean;
  publishError?: string;
  publishFailure?: CriticalFailure | null;
  onCopyLink?: () => void;
}

interface TimelineStep {
  label: string;
  complete: boolean;
  active?: boolean;
}

const mediaFieldTypes: FieldType[] = ["screenshot", "video"];

function displayValue(value: string | number | null | undefined, fallback: string) {
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

function formatBytesCompact(value: number | undefined) {
  if (!value || value <= 0) {
    return "";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function getSectionName(field: FormField | undefined, sections: FormSection[] | undefined, fallback: string) {
  if (!field?.sectionId) {
    return fallback;
  }
  const section = sections?.find((candidate) => candidate.id === field.sectionId);
  return section?.title?.trim() || fallback;
}

function getBranchInfo(field: FormField | undefined, fields: FormField[], fallback: string) {
  if (!field?.conditionalParentId) {
    return fallback;
  }
  const parent = fields.find((candidate) => candidate.id === field.conditionalParentId);
  const parentLabel = parent?.label?.trim() || "parent signal node";
  return field.conditionalValue
    ? `Branch from "${parentLabel}" when answer is "${field.conditionalValue}"`
    : `Branch from "${parentLabel}"`;
}

function supportsMarkdown(field?: FormField) {
  return field?.type === "markdown" || field?.type === "longText";
}

function supportsMedia(field?: FormField) {
  return field ? mediaFieldTypes.includes(field.type) : false;
}

function hasConditionalLogic(field?: FormField) {
  return Boolean(
    field?.conditionalParentId ||
      field?.conditionalValue ||
      field?.visibilityRules?.conditions.length ||
      field?.requiredRules?.conditions.length,
  );
}

function getFieldPreviewHint(field: FormField | undefined, fallback: string) {
  if (!field) {
    return fallback;
  }
  if (field.placeholder?.trim()) {
    return field.placeholder.trim();
  }
  if (field.helpText?.trim()) {
    return field.helpText.trim();
  }
  return fallback;
}

function createPreviewState(
  values: FormBuilderValues,
  activeFieldId: string | undefined,
  titleFallback: string,
  descriptionFallback: string,
  isReadyToPublish: boolean,
  publishedStatus: "preview" | "published",
): MirrorPreviewState {
  const orderedFields = getOrderedFields(values.fields ?? []);
  const resolvedActiveFieldId = activeFieldId || values.activeFieldId;
  const activeField =
    orderedFields.find((field) => field.id === resolvedActiveFieldId) ??
    orderedFields[0];
  const activeFieldIndex = activeField ? orderedFields.findIndex((field) => field.id === activeField.id) : -1;
  const isPrivate = Boolean(values.encryptSubmissions);
  const visibilityLabel = values.visibility === "public" ? "Public Signal" : values.visibility === "unlisted" ? "Link-only Signal" : "Private draft";
  const identityPolicyLabel = values.identityPolicy === "wallet_required" ? "Wallet required" : "No wallet required";

  return {
    activeField,
    activeFieldIndex,
    activeSectionName: getSectionName(activeField, values.sections, "Unsectioned Signal Flow"),
    activeBranchInfo: getBranchInfo(activeField, orderedFields, "Primary signal path"),
    fieldCount: orderedFields.length,
    requiredCount: orderedFields.filter((field) => field.required).length,
    title: values.title?.trim() || titleFallback,
    description: values.description?.trim() || descriptionFallback,
    titleFallback,
    descriptionFallback,
    markdownSupported: supportsMarkdown(activeField),
    mediaSupported: supportsMedia(activeField),
    hasConditionalLogic: hasConditionalLogic(activeField),
    isPrivate,
    isReadyToPublish,
    publishedStatus,
    visibilityLabel,
    identityPolicyLabel,
    signalModeLabel: isPrivate ? "Sealed Signal" : visibilityLabel,
  };
}

function getSignalObjectStatus(
  state: MirrorPreviewState,
  runtime: Pick<MirrorRuntimeState, "savedForm" | "saving" | "registeringOnSui" | "publishError" | "publishFailure">,
): SignalObjectStatus {
  if (runtime.publishFailure || runtime.publishError?.trim()) {
    return "failed";
  }
  if (runtime.saving || runtime.registeringOnSui) {
    return "publishing";
  }
  if (runtime.savedForm) {
    return "published";
  }
  if (state.isReadyToPublish) {
    return "ready";
  }
  return "draft";
}

function getStatusCopy(status: SignalObjectStatus, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "ready":
      return { label: t("mirrorStatusReady"), body: t("mirrorStatusReadyBody") };
    case "publishing":
      return { label: t("mirrorStatusPublishing"), body: t("mirrorStatusPublishingBody") };
    case "published":
      return { label: t("mirrorStatusPublished"), body: t("mirrorStatusPublishedBody") };
    case "failed":
      return { label: t("mirrorStatusFailed"), body: t("mirrorStatusFailedBody") };
    default:
      return { label: t("mirrorStatusDraft"), body: t("mirrorStatusDraftBody") };
  }
}

function createTimelineSteps(
  state: MirrorPreviewState,
  values: FormBuilderValues,
  runtime: MirrorRuntimeState,
  t: ReturnType<typeof useI18n>["t"],
): TimelineStep[] {
  const hasDraft = Boolean(values.title?.trim() && state.fieldCount > 0);
  const privacyConfigured =
    Boolean(values.visibility) &&
    Boolean(values.identityPolicy) &&
    typeof values.encryptSubmissions === "boolean";
  const walrusReady =
    Boolean(runtime.savedForm?.blobId) ||
    runtime.storageRuntimeMode === "walrus" ||
    runtime.storageRuntimeMode === "remote" ||
    runtime.walrusCostEstimate?.status === "ready";
  const published = Boolean(runtime.savedForm);

  return [
    { label: t("mirrorTimelineDraftComposed"), complete: hasDraft },
    { label: t("mirrorTimelineSchemaValidated"), complete: state.isReadyToPublish, active: hasDraft && !state.isReadyToPublish },
    { label: t("mirrorTimelinePrivacyConfigured"), complete: privacyConfigured },
    { label: t("mirrorTimelineWalrusReady"), complete: walrusReady, active: state.isReadyToPublish && !walrusReady },
    { label: t("mirrorTimelineSignalPublished"), complete: published, active: (runtime.saving || runtime.registeringOnSui) && !published },
  ];
}

function MirrorMetadataBadges({ state }: { state: MirrorPreviewState }) {
  const badges: MirrorBadge[] = [
    { label: state.publishedStatus === "published" ? "Published Signal" : "Preview only", tone: state.publishedStatus === "published" ? "active" : "warning" },
    { label: state.signalModeLabel, tone: state.isPrivate ? "private" : "active" },
    { label: state.identityPolicyLabel },
    { label: state.isReadyToPublish ? "Ready to publish" : "Review in progress", tone: state.isReadyToPublish ? "active" : "warning" },
    { label: state.activeField ? "Block mirror" : "No block yet", tone: state.activeField ? "active" : "warning" },
    { label: state.activeField?.required ? "Response required" : "Optional response" },
    { label: state.markdownSupported ? "Rich text enabled" : "Simple text input" },
    { label: state.mediaSupported ? "Media upload enabled" : "Text-only block" , tone: state.mediaSupported ? "media" : "default" },
    { label: state.hasConditionalLogic ? "Adaptive path" : "Step-by-step flow" },
  ];

  return (
    <div className="mirror-metadata-badges" aria-label="Mirror block metadata">
      {badges.map((badge) => (
        <span key={badge.label} className={`mirror-metadata-badge is-${badge.tone ?? "default"}`}>
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function MirrorObjectCard({ state, runtime }: { state: MirrorPreviewState; runtime: MirrorRuntimeState }) {
  return (
    <section className="mirror-object-card-v2" aria-label="Signal object preview">
      <div className="mirror-object-ambient" aria-hidden="true" />
      <div className="mirror-object-core" aria-hidden="true">
        <span className="mirror-object-core-eye mirror-object-core-eye-left" />
        <span className="mirror-object-core-eye mirror-object-core-eye-right" />
        <span className="mirror-object-core-tusk mirror-object-core-tusk-left" />
        <span className="mirror-object-core-tusk mirror-object-core-tusk-right" />
      </div>
      <div className="mirror-object-copy">
        <span className="mirror-object-kicker">object::signal_form</span>
        <strong>{state.title}</strong>
        <small>{state.fieldCount} block{state.fieldCount === 1 ? "" : "s"} reflected in this signal object</small>
      </div>
      <div className="mirror-object-ledger">
        <span>Storage</span>
        <strong>{runtime.savedForm?.blobId ? "Walrus object" : runtime.storageRuntimeMode || "Local preview"}</strong>
      </div>
    </section>
  );
}

function MirrorSignalMetadata({ state, runtime }: { state: MirrorPreviewState; runtime: MirrorRuntimeState }) {
  const { t } = useI18n();
  const sealedLabel = state.isPrivate ? "Encrypted responses" : "Response privacy";
  const rows = [
    ["Status", state.publishedStatus === "published" ? "Published Signal" : "Preview only"],
    ["Walrus ref", displayValue(runtime.savedForm?.blobId, "preview.local")],
    ["Schema v1", `${state.fieldCount} blocks`],
    ["Visibility", state.visibilityLabel],
    [sealedLabel, state.isPrivate ? t("mirrorSealEnabled") : t("mirrorOpenIntake")],
    ["Responder access", state.identityPolicyLabel],
    [t("mirrorRuntimeMode"), displayValue(runtime.storageRuntimeMode, t("notConfigured"))],
    [t("mirrorStorageMode"), runtime.walrusCostEstimate?.storageMode ?? runtime.storageRuntimeMode ?? "local"],
    [t("mirrorRuntimeNotice"), displayValue(runtime.storageRuntimeNotice, t("none"))],
    [t("mirrorBlobId"), displayValue(runtime.savedForm?.blobId, t("notCreatedYet"))],
    [t("mirrorManifestBlobId"), displayValue(runtime.savedForm?.manifestBlobId, t("notCreatedYet"))],
    [t("mirrorOnchainFormId"), displayValue(runtime.savedForm?.onchainFormId, t("notRegisteredYet"))],
    [t("mirrorSealState"), state.isPrivate ? t("mirrorSealEnabled") : t("mirrorOpenIntake")],
    [t("mirrorIdentityPolicy"), state.identityPolicyLabel],
    runtime.walrusCostEstimate
      ? [t("mirrorCostEstimate"), `${formatBytesCompact(runtime.walrusCostEstimate.payloadBytes)} ${runtime.walrusCostEstimate.status}`.trim()]
      : [t("mirrorCostEstimate"), t("notConfigured")],
    runtime.storageRuntimeDiagnostics
      ? [t("mirrorStorageDiagnostics"), runtime.storageRuntimeDiagnostics.lastRpcError || runtime.storageRuntimeDiagnostics.stage]
      : [t("mirrorStorageDiagnostics"), t("none")],
    ["Publish readiness", state.isReadyToPublish ? "Ready" : "Needs review"],
  ];

  return (
    <div className="mirror-signal-metadata" aria-label="DeepSignal metadata">
      {rows.map(([label, value]) => (
        <span key={label}>
          <small>{label}</small>
          <strong>{value}</strong>
        </span>
      ))}
    </div>
  );
}

function MirrorPublishReadiness({ state }: { state: MirrorPreviewState }) {
  const checks: Array<[string, boolean]> = [
    ["Title is set", state.title !== state.titleFallback],
    ["At least 1 block", state.fieldCount > 0],
    ["Required blocks reviewed", true],
    ["Privacy mode selected", Boolean(state.signalModeLabel)],
    ["Ready to publish", state.isReadyToPublish],
  ];

  return (
    <section className="mirror-readiness-card" aria-label="Publish readiness">
      <div>
        <p className="eyebrow">Publish Readiness</p>
        <h3>{state.isReadyToPublish ? "Signal is ready" : "Review before publishing"}</h3>
        <p className="muted">
          {state.publishedStatus === "published"
            ? "This signal object has been published."
            : "Nothing is published yet. This is a live mirror of local draft state."}
        </p>
      </div>
      <div className="mirror-readiness-list">
        {checks.map(([label, ready]) => (
          <span key={label} className={ready ? "is-ready" : "is-pending"}>
            <i aria-hidden="true">{ready ? "OK" : "..."}</i>
            <strong>{label}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function MirrorSignalObjectStatus({
  state,
  runtime,
  timelineSteps,
}: {
  state: MirrorPreviewState;
  runtime: MirrorRuntimeState;
  timelineSteps: TimelineStep[];
}) {
  const { t } = useI18n();
  const status = getSignalObjectStatus(state, runtime);
  const statusCopy = getStatusCopy(status, t);
  const completedCount = timelineSteps.filter((step) => step.complete).length;
  const progress = Math.max(8, Math.round((completedCount / timelineSteps.length) * 100));
  const failureMessage = runtime.publishFailure?.message || runtime.publishError?.trim();

  return (
    <section className={`mirror-object-status-card is-${status}`} aria-label={t("mirrorSignalObjectStatus")}>
      <div className="mirror-object-status-header">
        <div>
          <p className="eyebrow">{t("mirrorSignalObjectStatus")}</p>
          <h3>{statusCopy.label}</h3>
        </div>
        <span className={`mirror-object-status-pill is-${status}`}>{statusCopy.label}</span>
      </div>
      <p className="muted">{failureMessage || statusCopy.body}</p>
      <div className="mirror-object-status-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <small className="mirror-object-status-fallback">
        {runtime.savedForm ? t("mirrorStatusPublishedFallback") : t("mirrorStatusDraftFallback")}
      </small>
    </section>
  );
}

function MirrorPublishTimeline({ steps }: { steps: TimelineStep[] }) {
  const { t } = useI18n();

  return (
    <section className="mirror-publish-timeline" aria-label={t("mirrorTimelineTitle")}>
      <div>
        <p className="eyebrow">{t("mirrorTimelineTitle")}</p>
        <h3>{t("mirrorTimelineHeading")}</h3>
      </div>
      <div className="mirror-timeline-list">
        {steps.map((step, index) => (
          <span
            key={step.label}
            className={step.complete ? "is-complete" : step.active ? "is-active" : "is-pending"}
          >
            <i aria-hidden="true">{step.complete ? "OK" : index + 1}</i>
            <strong>{step.label}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function MirrorPublishedSignalCard({ runtime }: { runtime: MirrorRuntimeState }) {
  const { t } = useI18n();
  const savedForm = runtime.savedForm;
  if (!savedForm) {
    return null;
  }
  const signalLink = runtime.publicUrl || runtime.publicPath || "";
  const rows = [
    [t("mirrorPublicLink"), displayValue(signalLink, t("notCreatedYet"))],
    [t("mirrorFormId"), displayValue(savedForm.id, t("notCreatedYet"))],
    [t("mirrorBlobId"), displayValue(savedForm.blobId, t("notCreatedYet"))],
    [t("mirrorManifestBlobId"), displayValue(savedForm.manifestBlobId, t("notCreatedYet"))],
    [t("mirrorOnchainFormId"), displayValue(savedForm.onchainFormId, t("notRegisteredYet"))],
  ];

  return (
    <section className="mirror-published-card" aria-label={t("mirrorPublishedSignal")}>
      <div className="mirror-published-card-header">
        <div>
          <p className="eyebrow">{t("mirrorPublishedSignal")}</p>
          <h3>{savedForm.title || t("untitledForm")}</h3>
        </div>
        {signalLink ? (
          <a className="ghost-button mirror-open-signal-link" href={signalLink} target="_blank" rel="noreferrer">
            {t("mirrorOpenSignal")}
          </a>
        ) : null}
      </div>
      <div className="mirror-published-grid">
        {rows.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      {signalLink && runtime.onCopyLink ? (
        <button type="button" className="secondary-button mirror-copy-link-button" onClick={() => void runtime.onCopyLink?.()}>
          {t("mirrorCopyLink")}
        </button>
      ) : null}
    </section>
  );
}

function MirrorCurrentSignalNode({ state }: { state: MirrorPreviewState }) {
  const { fieldTypeLabel, t } = useI18n();
  const field = state.activeField;
  const label = field?.label?.trim() || t("askPlaceholder");
  const hint = getFieldPreviewHint(field, t("placeholderExample"));
  const options = field?.options?.filter((option) => option.trim()) ?? [];
  const matrixRows = field?.rows?.filter((row) => row.trim()) ?? ["Signal quality", "Urgency"];
  const matrixColumns = field?.columns?.filter((column) => column.trim()) ?? ["Low", "Medium", "High"];

  if (!field) {
    return (
      <section className="mirror-current-node-card is-empty">
        <div className="mirror-empty-constellation" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="eyebrow">Empty Signal</p>
          <h3>No blocks in this mirror yet</h3>
          <p className="muted">Compose a block on the left to start shaping the signal object.</p>
        </div>
      </section>
    );
  }

  return (
    <section key={field.id} className="mirror-current-node-card is-reflecting">
      <div className="mirror-current-node-header">
        <div>
          <p className="eyebrow">Current Signal Node</p>
          <h3>{label}</h3>
        </div>
        <span className="mirror-reflecting-pill">Reflecting now</span>
      </div>

      <div className="mirror-current-node-grid">
        <span>
          <small>Node</small>
          <strong>B{state.activeFieldIndex + 1}</strong>
        </span>
        <span>
          <small>Block type</small>
          <strong>{fieldTypeLabel(field.type)}</strong>
        </span>
        <span>
          <small>Requirement</small>
          <strong>{field.required ? t("required") : t("optional")}</strong>
        </span>
        <span>
          <small>Section</small>
          <strong>{state.activeSectionName}</strong>
        </span>
      </div>

      <div className="mirror-current-node-body">
        <div>
          <small>Placeholder / helper text</small>
          <p>{hint}</p>
        </div>
        <div>
          <small>Branch path</small>
          <p>{state.activeBranchInfo}</p>
        </div>
      </div>

      <div className="mirror-question-frame">
        <div className="mirror-question-frame-topline">
          <span>{state.markdownSupported ? "Markdown supported" : "Plain input"}</span>
          <span>{state.mediaSupported ? "Media supported" : "No media"}</span>
          {state.hasConditionalLogic ? <span>Adaptive path</span> : <span>Linear node</span>}
        </div>
        {field.helpText?.trim() ? <p className="muted">{field.helpText.trim()}</p> : null}

        {field.type === "dropdown" || field.type === "checkbox" ? (
          <div className="mirror-choice-list">
            {(options.length ? options : ["Option 1", "Option 2"]).slice(0, 4).map((option) => (
              <span key={option}>{option}</span>
            ))}
          </div>
        ) : null}

        {field.type === "matrix" ? (
          <div className="mirror-matrix-preview" aria-hidden="true">
            <div className="mirror-matrix-preview-row is-header">
              <span />
              {matrixColumns.slice(0, 3).map((column) => (
                <strong key={column}>{column}</strong>
              ))}
            </div>
            {matrixRows.slice(0, 3).map((row) => (
              <div key={row} className="mirror-matrix-preview-row">
                <span>{row}</span>
                {matrixColumns.slice(0, 3).map((column) => (
                  <i key={column} />
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {field.type === "rating" ? (
          <div className="mirror-rating-preview" aria-hidden="true">
            <span>*****</span>
            <small>{t("chooseRating")}</small>
          </div>
        ) : null}

        {mediaFieldTypes.includes(field.type) ? (
          <div className="mirror-upload-preview is-media-ready">
            <span className="mirror-upload-icon" aria-hidden="true" />
            <strong>{field.type === "screenshot" ? t("fieldTypeScreenshot") : t("fieldTypeVideo")}</strong>
            <small>{field.type === "screenshot" ? t("screenshotHint") : t("videoHint")}</small>
          </div>
        ) : null}

        {field.type !== "dropdown" &&
        field.type !== "checkbox" &&
        field.type !== "matrix" &&
        field.type !== "rating" &&
        !mediaFieldTypes.includes(field.type) ? (
          <div className={`mirror-input-preview ${isLongTextLikeField(field.type) ? "is-long" : ""}`}>
            <span>{field.type === "markdown" ? t("markdownPreviewExample") : hint}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function MirrorPreviewPanel({
  values,
  activeFieldId,
  isReadyToPublish = false,
  publishedStatus = "preview",
  surface = "builder",
  savedForm = null,
  publicUrl = "",
  publicPath = "",
  storageRuntimeMode,
  storageRuntimeNotice,
  storageRuntimeDiagnostics = null,
  walrusCostEstimate = null,
  saving = false,
  registeringOnSui = false,
  publishError = "",
  publishFailure = null,
  onCopyLink,
}: MirrorPreviewPanelProps) {
  const { t } = useI18n();
  const state = useMemo(
    () => createPreviewState(values, activeFieldId, t("untitledForm"), t("publicDefaultBody"), isReadyToPublish, publishedStatus),
    [activeFieldId, isReadyToPublish, publishedStatus, t, values],
  );
  const runtime = useMemo<MirrorRuntimeState>(
    () => ({
      savedForm,
      publicUrl,
      publicPath,
      storageRuntimeMode,
      storageRuntimeNotice,
      storageRuntimeDiagnostics,
      walrusCostEstimate,
      saving,
      registeringOnSui,
      publishError,
      publishFailure,
      onCopyLink,
    }),
    [
      onCopyLink,
      publicPath,
      publicUrl,
      publishError,
      publishFailure,
      registeringOnSui,
      savedForm,
      saving,
      storageRuntimeDiagnostics,
      storageRuntimeMode,
      storageRuntimeNotice,
      walrusCostEstimate,
    ],
  );
  const timelineSteps = useMemo(
    () => createTimelineSteps(state, values, runtime, t),
    [runtime, state, t, values],
  );

  return (
    <aside className="panel glow-panel mirror-preview-panel mirror-theme-surface" data-surface={surface} aria-label="Signal Mirror Panel">
      <div className="mirror-panel-header">
        <div>
          <p className="eyebrow">Signal Mirror</p>
          <h2>{state.title}</h2>
        </div>
        <span className="mirror-preview-only-pill">{state.publishedStatus === "published" ? "Published" : "Preview only"}</span>
      </div>

      <p className="mirror-description">{state.description}</p>

      <MirrorObjectCard state={state} runtime={runtime} />
      <MirrorCurrentSignalNode state={state} />
      <MirrorSignalObjectStatus state={state} runtime={runtime} timelineSteps={timelineSteps} />
      <div className="mirror-desktop-detail-stack">
        <MirrorMetadataBadges state={state} />
        <MirrorSignalMetadata state={state} runtime={runtime} />
        <MirrorPublishTimeline steps={timelineSteps} />
        <MirrorPublishedSignalCard runtime={runtime} />
        <MirrorPublishReadiness state={state} />
      </div>
      <div className="mirror-mobile-detail-stack">
        <details className="mirror-mobile-detail">
          <summary>{t("mirrorSignalDetails")}</summary>
          <MirrorMetadataBadges state={state} />
          <MirrorSignalMetadata state={state} runtime={runtime} />
        </details>
        <details className="mirror-mobile-detail">
          <summary>{t("mirrorPublishReadiness")}</summary>
          <MirrorPublishTimeline steps={timelineSteps} />
          <MirrorPublishedSignalCard runtime={runtime} />
          <MirrorPublishReadiness state={state} />
        </details>
      </div>
    </aside>
  );
}
