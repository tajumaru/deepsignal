import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FormFieldEditor } from "../../../components/FormFieldEditor";
import { getConditionalChildFields, getOrderedFields } from "../../../utils/formLogic";
import type { DisplayMode, FieldType, FormBuilderRefs, FormField, FormSection, Translate } from "../types";
import { StepNavigationActions } from "./StepNavigationActions";

interface FieldsStepProps {
  t: Translate;
  title: string;
  description: string;
  fields: FormField[];
  sections: FormSection[];
  encryptSubmissions: boolean;
  draggedFieldId: string | null;
  dragOverFieldId: string | null;
  dragOverPlacement: "before" | "after" | null;
  refs: FormBuilderRefs;
  setActiveFieldId: (fieldId: string) => void;
  setDraggedFieldId: (fieldId: string | null) => void;
  setDragOverFieldId: (fieldId: string | null) => void;
  setDragOverPlacement: (placement: "before" | "after" | null) => void;
  onAddSection: (preset?: string) => FormSection;
  onUpdateSection: (sectionId: string, patch: Partial<FormSection>) => void;
  onRemoveSection: (sectionId: string) => void;
  onUpdateField: (index: number, field: FormField) => void;
  onRemoveField: (fieldId: string) => void;
  onDuplicateField: (fieldId: string) => void;
  onInsertConditionalField: (fieldId: string) => void;
  onInsertField: (type: FieldType, afterIndex?: number, sectionId?: string) => void;
  onReorderFields: (sourceId: string, targetId: string, placement?: "before" | "after") => void;
  onOpenFieldTypePicker: () => void;
  onBack: () => void;
  onContinue: () => void;
  displayMode?: DisplayMode;
}

const libraryBlocks: Array<{
  type?: FieldType;
  icon: string;
  titleKey: "libraryShortText" | "libraryLongText" | "libraryRichText" | "libraryDate" | "libraryDropdown" | "libraryCheckboxes" | "libraryMatrix" | "libraryCountrySelect" | "libraryConfirmationCheckbox" | "libraryScreenshotUpload" | "libraryVideoUpload" | "libraryUrl" | "libraryStarRating" | "libraryWalletAddress" | "librarySignatureVerification" | "libraryEncryptedAnswer";
  soon?: boolean;
  mirrorTitle: string;
  mirrorBody: string;
  mirrorKind: "question" | "media" | "identity" | "markdown" | "choice" | "attachment";
}> = [
  { type: "shortText", icon: "Aa", titleKey: "libraryShortText", mirrorTitle: "Question Block", mirrorBody: "Single signal prompt", mirrorKind: "question" },
  { type: "longText", icon: "LT", titleKey: "libraryLongText", mirrorTitle: "Reflection Block", mirrorBody: "Long-form signal context", mirrorKind: "question" },
  { type: "markdown", icon: "MD", titleKey: "libraryRichText", mirrorTitle: "Markdown Block", mirrorBody: "Formatted narrative copy", mirrorKind: "markdown" },
  { type: "date", icon: "CAL", titleKey: "libraryDate", mirrorTitle: "Timeline Block", mirrorBody: "Capture a date marker", mirrorKind: "question" },
  { type: "dropdown", icon: "v", titleKey: "libraryDropdown", mirrorTitle: "Choice Block", mirrorBody: "Single-select branch", mirrorKind: "choice" },
  { type: "checkbox", icon: "[]", titleKey: "libraryCheckboxes", mirrorTitle: "Multi Choice Block", mirrorBody: "Multi-select signal", mirrorKind: "choice" },
  { type: "matrix", icon: "GRID", titleKey: "libraryMatrix", mirrorTitle: "Matrix Block", mirrorBody: "Structured comparison", mirrorKind: "choice" },
  { type: "country_select", icon: "JP", titleKey: "libraryCountrySelect", mirrorTitle: "Identity Block", mirrorBody: "Location signal", mirrorKind: "identity" },
  { type: "confirmation", icon: "OK", titleKey: "libraryConfirmationCheckbox", mirrorTitle: "Consent Block", mirrorBody: "Explicit confirmation", mirrorKind: "identity" },
  { type: "screenshot", icon: "UP", titleKey: "libraryScreenshotUpload", mirrorTitle: "Media Block", mirrorBody: "Image evidence upload", mirrorKind: "media" },
  { type: "video", icon: "VID", titleKey: "libraryVideoUpload", mirrorTitle: "Video Block", mirrorBody: "Motion evidence upload", mirrorKind: "media" },
  { type: "url", icon: "->", titleKey: "libraryUrl", mirrorTitle: "Reference Block", mirrorBody: "Link external context", mirrorKind: "attachment" },
  { type: "rating", icon: "*", titleKey: "libraryStarRating", mirrorTitle: "Sentiment Block", mirrorBody: "Quick intensity rating", mirrorKind: "question" },
  { icon: "ID", titleKey: "libraryWalletAddress", soon: true, mirrorTitle: "Wallet Block", mirrorBody: "Wallet identity signal", mirrorKind: "identity" },
  { icon: "OK", titleKey: "librarySignatureVerification", soon: true, mirrorTitle: "Signature Block", mirrorBody: "Proof-of-author block", mirrorKind: "identity" },
  { icon: "PX", titleKey: "libraryEncryptedAnswer", soon: true, mirrorTitle: "Sealed Block", mirrorBody: "Encrypted answer node", mirrorKind: "attachment" },
];

const signalFlowPresets = ["Introduction", "Context", "Experience", "Reflection", "Identity"];
const mirrorIntentActions: Array<{ label: string; detail: string; type: FieldType; section?: string }> = [
  { label: "Collect intent", detail: "Core private signal", type: "longText", section: "Signal" },
  { label: "Allow evidence", detail: "Attachment lane", type: "screenshot", section: "Evidence" },
  { label: "Add priority", detail: "Review triage", type: "dropdown", section: "Triage" },
  { label: "Optional identity", detail: "Responder context", type: "country_select", section: "Identity" },
];

export function FieldsStep({
  t,
  title,
  description,
  fields,
  sections,
  encryptSubmissions,
  draggedFieldId,
  dragOverFieldId,
  dragOverPlacement,
  refs,
  setActiveFieldId,
  setDraggedFieldId,
  setDragOverFieldId,
  setDragOverPlacement,
  onAddSection,
  onUpdateSection,
  onRemoveSection,
  onUpdateField,
  onRemoveField,
  onDuplicateField,
  onInsertConditionalField,
  onInsertField,
  onReorderFields,
  onOpenFieldTypePicker,
  onBack,
  onContinue,
  displayMode = "classic",
}: FieldsStepProps) {
  const [expandedFieldId, setExpandedFieldId] = useState(fields[0]?.id ?? "");
  const isMirrorPresentation = displayMode === "mirror";

  useEffect(() => {
    if (!fields.length) {
      setExpandedFieldId("");
      return;
    }
    if (!fields.some((field) => field.id === expandedFieldId)) {
      setExpandedFieldId(fields[0]?.id ?? "");
    }
  }, [expandedFieldId, fields]);

  const orderedFields = useMemo(() => getOrderedFields(fields), [fields]);
  const unsectionedFields = useMemo(
    () => orderedFields.filter((field) => !field.sectionId && !field.conditionalParentId),
    [orderedFields],
  );
  const sectionGroups = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        fields: orderedFields.filter((field) => field.sectionId === section.id && !field.conditionalParentId),
      })),
    [orderedFields, sections],
  );

  function sharedCardHandlers(field: FormField) {
    return {
      rootRef(node: HTMLElement | null) {
        refs.fieldCardRefs.current[field.id] = node;
      },
      labelRef(node: HTMLInputElement | null) {
        refs.labelRefs.current[field.id] = node;
      },
      onToggleExpand() {
        setExpandedFieldId((current) => (current === field.id ? "" : field.id));
      },
      onFocus() {
        setActiveFieldId(field.id);
        setExpandedFieldId(field.id);
      },
      onDragStart(event: DragEvent<HTMLElement>) {
        event.dataTransfer.effectAllowed = "move";
        setDraggedFieldId(field.id);
      },
      onDragEnd() {
        setDraggedFieldId(null);
        setDragOverFieldId(null);
        setDragOverPlacement(null);
      },
      onDragOver(event: DragEvent<HTMLElement>) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const bounds = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY - bounds.top > bounds.height / 2 ? "after" : "before";
        setDragOverFieldId(field.id);
        setDragOverPlacement(placement);
      },
      onDrop(event: DragEvent<HTMLElement>) {
        event.preventDefault();
        if (draggedFieldId) {
          onReorderFields(draggedFieldId, field.id, dragOverPlacement ?? "before");
        }
        setDraggedFieldId(null);
        setDragOverFieldId(null);
        setDragOverPlacement(null);
      },
    };
  }

  function renderFieldNode(field: FormField, index: number) {
    const conditionalChildren = getConditionalChildFields(fields, field.id);
    const handlers = sharedCardHandlers(field);

    return (
      <div key={field.id} className="composer-question-node">
        <FormFieldEditor
          field={field}
          fields={fields}
          index={index}
          sections={sections}
          isDragging={draggedFieldId === field.id}
          isExpanded={expandedFieldId === field.id}
          presentation={displayMode}
          dropIndicator={dragOverFieldId === field.id ? dragOverPlacement : null}
          onChange={(nextField) => onUpdateField(index, nextField)}
          onRemove={() => onRemoveField(field.id)}
          onDuplicate={() => onDuplicateField(field.id)}
          onAddBelow={() => onInsertField(field.type, index, field.sectionId)}
          onAddConditionalQuestion={() => onInsertConditionalField(field.id)}
          rootRef={handlers.rootRef}
          labelRef={handlers.labelRef}
          onToggleExpand={handlers.onToggleExpand}
          onFocus={handlers.onFocus}
          onDragStart={handlers.onDragStart}
          onDragEnd={handlers.onDragEnd}
          onDragOver={handlers.onDragOver}
          onDrop={handlers.onDrop}
        />

        {conditionalChildren.map((child) => {
          const childIndex = fields.findIndex((item) => item.id === child.id);
          const childHandlers = sharedCardHandlers(child);
          return (
            <div key={child.id} className="composer-conditional-branch">
              <div className="composer-conditional-branch-label">
                <span className="composer-conditional-branch-arrow">{"->"}</span>
                <span>{child.conditionalValue ? t("conditionalBranchLabel", { value: child.conditionalValue }) : t("conditionalQuestionNeedsValue")}</span>
              </div>
              <FormFieldEditor
                field={child}
                fields={fields}
                index={childIndex}
                sections={sections}
                isDragging={draggedFieldId === child.id}
                isExpanded={expandedFieldId === child.id}
                presentation={displayMode}
                dropIndicator={dragOverFieldId === child.id ? dragOverPlacement : null}
                onChange={(nextField) => onUpdateField(childIndex, nextField)}
                onRemove={() => onRemoveField(child.id)}
                onDuplicate={() => onDuplicateField(child.id)}
                onAddBelow={() => onInsertField(child.type, childIndex, child.sectionId)}
                onAddConditionalQuestion={() => undefined}
                rootRef={childHandlers.rootRef}
                labelRef={childHandlers.labelRef}
                onToggleExpand={childHandlers.onToggleExpand}
                onFocus={childHandlers.onFocus}
                onDragStart={childHandlers.onDragStart}
                onDragEnd={childHandlers.onDragEnd}
                onDragOver={childHandlers.onDragOver}
                onDrop={childHandlers.onDrop}
              />
            </div>
          );
        })}
      </div>
    );
  }

  function addMirrorIntentAction(action: (typeof mirrorIntentActions)[number]) {
    const section = action.section
      ? sections.find((item) => item.title === action.section) ?? onAddSection(action.section)
      : undefined;
    onInsertField(action.type, undefined, section?.id);
  }

  return (
    <section className={`composer-builder-grid composer-builder-grid-composer ${isMirrorPresentation ? "signal-composition-studio" : ""}`}>
      <aside className="composer-builder-column composer-library-column">
        <section className="panel composer-section-card composer-library-panel">
          <div className="composer-pane-heading">
            <div>
              <p className="eyebrow">{isMirrorPresentation ? "Intent Controls" : "Step 3"}</p>
              <h2>{isMirrorPresentation ? "Signal Shape" : t("blockLibraryTitle")}</h2>
              <p className="muted">
                {isMirrorPresentation ? "Choose the channel behavior before editing individual blocks." : t("blockLibraryBody")}
              </p>
            </div>
            <button type="button" className="ghost-button" onClick={() => onAddSection()}>
              {isMirrorPresentation ? "Add Flow" : t("addSection")}
            </button>
          </div>

          {isMirrorPresentation ? (
            <div className="mirror-intent-action-grid" aria-label="Intent controls">
              {mirrorIntentActions.map((action) => (
                <button key={action.label} type="button" className="mirror-intent-action" onClick={() => addMirrorIntentAction(action)}>
                  <strong>{action.label}</strong>
                  <span>{action.detail}</span>
                </button>
              ))}
            </div>
          ) : null}

          {isMirrorPresentation ? (
            <div className="signal-flow-presets" aria-label="Narrative flow presets">
              {signalFlowPresets.map((preset) => (
                <button key={preset} type="button" className="signal-flow-preset" onClick={() => onAddSection(preset)}>
                  {preset}
                </button>
              ))}
            </div>
          ) : null}

          <div className="composer-library-scroll">
            <div className="composer-library-list">
              {libraryBlocks.map((block) => (
                <button
                  key={block.titleKey}
                  type="button"
                  className={`composer-library-card ${isMirrorPresentation ? `signal-block-palette-card is-${block.mirrorKind}` : ""} ${
                    block.soon ? "is-soon" : ""
                  }`}
                  onClick={() => {
                    if (block.type) {
                      onInsertField(block.type);
                    }
                  }}
                  disabled={!block.type}
                >
                  <span className="composer-library-card-icon" aria-hidden="true">
                    {block.icon}
                  </span>
                  <span className="composer-library-card-copy">
                    <span className="composer-library-card-topline">
                      <strong>{isMirrorPresentation ? block.mirrorTitle : t(block.titleKey)}</strong>
                      <span className={`composer-library-chip ${block.soon ? "is-soon" : "is-ready"}`}>
                        {block.soon ? t("librarySoon") : t("libraryReady")}
                      </span>
                    </span>
                    {isMirrorPresentation ? <small className="muted">{block.mirrorBody}</small> : null}
                  </span>
                </button>
              ))}
            </div>
            <span className="composer-library-swipe-cue" aria-hidden="true" />
          </div>

          <div className="composer-library-footer">
            <p className="muted">{isMirrorPresentation ? "Private signal received -> ready for review." : t("conditionalShortcutHint")}</p>
            <button type="button" className="ghost-button" onClick={onOpenFieldTypePicker}>
              {isMirrorPresentation ? "More Blocks" : t("moreTypes")}
            </button>
          </div>
        </section>
      </aside>

      <div className="composer-builder-column composer-editor-column">
        <section className="panel composer-section-card composer-step-card composer-canvas-panel">
          <div className="composer-pane-heading composer-question-header">
            <div>
              <p className="eyebrow">{isMirrorPresentation ? "Composition Canvas" : t("liveCanvas")}</p>
              <h2>{isMirrorPresentation ? "Signal Flow" : t("fields")}</h2>
              <p className="muted">
                {isMirrorPresentation
                  ? `${fields.length} block${fields.length === 1 ? "" : "s"} / ${encryptSubmissions ? "sealed signal" : "open signal"}`
                  : `${t("questionCount", { count: fields.length })} / ${encryptSubmissions ? t("signalModePrivate") : t("signalModeOpen")}`}
              </p>
            </div>
            <div className="composer-canvas-header-actions">
              <button type="button" className="ghost-button" onClick={() => onAddSection()}>
                {isMirrorPresentation ? "Add Flow" : t("addSection")}
              </button>
              <button type="button" className="primary-button composer-add-question-button" onClick={onOpenFieldTypePicker}>
                + {isMirrorPresentation ? "Compose Block" : t("addQuestion")}
              </button>
            </div>
          </div>

          <div className="composer-canvas-intro">
            <strong>{title.trim() || t("untitledForm")}</strong>
            <p className="muted">{description.trim() || (isMirrorPresentation ? "Currently shaping signal node." : t("liveCanvasBody"))}</p>
            {isMirrorPresentation ? (
              <span className="signal-node-status">
                Currently shaping signal node: {expandedFieldId ? `B${fields.findIndex((field) => field.id === expandedFieldId) + 1}` : "none selected"}
              </span>
            ) : null}
          </div>

          <div className="stack composer-question-stack">
            {unsectionedFields.map((field) => renderFieldNode(field, fields.findIndex((item) => item.id === field.id)))}

            {sectionGroups.map((section) => (
              <section key={section.id} className="composer-inline-section composer-canvas-section">
                <div className="composer-inline-section-header">
                  <div className="composer-inline-section-rule" aria-hidden="true" />
                  <div className="composer-inline-section-main">
                    <input
                      className="composer-inline-section-title"
                      value={section.title}
                      onChange={(event) => onUpdateSection(section.id, { title: event.target.value })}
                      placeholder={t("untitledSection")}
                    />
                    <span className="question-card-type">
                      {isMirrorPresentation ? `${section.fields.length} block${section.fields.length === 1 ? "" : "s"}` : t("questionCount", { count: section.fields.length })}
                    </span>
                  </div>
                  <button type="button" className="danger-button" onClick={() => onRemoveSection(section.id)}>
                    {t("remove")}
                  </button>
                </div>

                <input
                  className="composer-inline-section-description"
                  value={section.description ?? ""}
                  onChange={(event) => onUpdateSection(section.id, { description: event.target.value })}
                  placeholder={t("sectionDescriptionPlaceholder")}
                />

                {section.fields.length > 0 ? (
                  <div className="stack composer-question-stack">
                    {section.fields.map((field) => renderFieldNode(field, fields.findIndex((item) => item.id === field.id)))}
                  </div>
                ) : (
                  <div className="composer-section-empty">
                    <p className="muted composer-inline-empty">
                      {isMirrorPresentation ? "This flow is ready for a composed block." : t("sectionEmptyQuestions")}
                    </p>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onInsertField("shortText", undefined, section.id)}
                    >
                      + {isMirrorPresentation ? "Compose Block" : t("addQuestion")}
                    </button>
                  </div>
                )}
              </section>
            ))}
          </div>

          {fields.length === 0 ? (
            <section className="composer-empty-canvas">
              <p className="muted">{t("fieldEmptyState")}</p>
              <button type="button" className="primary-button" onClick={() => onInsertField("shortText")}>
                + {isMirrorPresentation ? "Start Signal Block" : t("shortTextLabel")}
              </button>
            </section>
          ) : null}

          <StepNavigationActions t={t} onBack={onBack} onContinue={onContinue} />
        </section>
      </div>
    </section>
  );
}
