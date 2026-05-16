import { useMemo } from "react";
import { useI18n } from "../../../i18n";
import { isLongTextLikeField } from "../../../lib/fieldTypes";
import { getOrderedFields } from "../../../utils/formLogic";
import type { FieldType, FormBuilderValues, FormField, FormSection } from "../types";

interface MirrorPreviewPanelProps {
  values: FormBuilderValues;
  activeFieldId?: string;
  isReadyToPublish?: boolean;
  publishedStatus?: "preview" | "published";
  surface?: "builder" | "publish";
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

const mediaFieldTypes: FieldType[] = ["screenshot", "video"];

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

function MirrorObjectCard({ state }: { state: MirrorPreviewState }) {
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
        <strong>Local preview</strong>
      </div>
    </section>
  );
}

function MirrorSignalMetadata({ state }: { state: MirrorPreviewState }) {
  const sealedLabel = state.isPrivate ? "Encrypted responses" : "Response privacy";
  const rows = [
    ["Status", state.publishedStatus === "published" ? "Published Signal" : "Preview only"],
    ["Walrus ref", "preview.local"],
    ["Schema v1", `${state.fieldCount} blocks`],
    ["Visibility", state.visibilityLabel],
    [sealedLabel, state.isPrivate ? "Seal enabled" : "Standard intake"],
    ["Responder access", state.identityPolicyLabel],
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
}: MirrorPreviewPanelProps) {
  const { t } = useI18n();
  const state = useMemo(
    () => createPreviewState(values, activeFieldId, t("untitledForm"), t("publicDefaultBody"), isReadyToPublish, publishedStatus),
    [activeFieldId, isReadyToPublish, publishedStatus, t, values],
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

      <MirrorObjectCard state={state} />
      <MirrorCurrentSignalNode state={state} />
      <div className="mirror-desktop-detail-stack">
        <MirrorMetadataBadges state={state} />
        <MirrorSignalMetadata state={state} />
        <MirrorPublishReadiness state={state} />
      </div>
      <div className="mirror-mobile-detail-stack">
        <details className="mirror-mobile-detail">
          <summary>{t("mirrorSignalDetails")}</summary>
          <MirrorMetadataBadges state={state} />
          <MirrorSignalMetadata state={state} />
        </details>
        <details className="mirror-mobile-detail">
          <summary>{t("mirrorPublishReadiness")}</summary>
          <MirrorPublishReadiness state={state} />
        </details>
      </div>
    </aside>
  );
}
