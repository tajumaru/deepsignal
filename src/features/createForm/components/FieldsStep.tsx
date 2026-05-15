import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FormFieldEditor } from "../../../components/FormFieldEditor";
import { getConditionalChildFields, getOrderedFields } from "../../../utils/formLogic";
import type { FieldType, FormBuilderRefs, FormField, FormSection, Translate } from "../types";

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
  onAddSection: (preset?: string) => void;
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
}

const libraryBlocks: Array<{
  type?: FieldType;
  icon: string;
  titleKey: "libraryShortText" | "libraryLongText" | "libraryRichText" | "libraryDate" | "libraryDropdown" | "libraryCheckboxes" | "libraryMatrix" | "libraryCountrySelect" | "libraryConfirmationCheckbox" | "libraryScreenshotUpload" | "libraryVideoUpload" | "libraryUrl" | "libraryStarRating" | "libraryWalletAddress" | "librarySignatureVerification" | "libraryEncryptedAnswer";
  soon?: boolean;
}> = [
  { type: "shortText", icon: "Aa", titleKey: "libraryShortText" },
  { type: "longText", icon: "LT", titleKey: "libraryLongText" },
  { type: "markdown", icon: "MD", titleKey: "libraryRichText" },
  { type: "date", icon: "CAL", titleKey: "libraryDate" },
  { type: "dropdown", icon: "v", titleKey: "libraryDropdown" },
  { type: "checkbox", icon: "[]", titleKey: "libraryCheckboxes" },
  { type: "matrix", icon: "GRID", titleKey: "libraryMatrix" },
  { type: "country_select", icon: "JP", titleKey: "libraryCountrySelect" },
  { type: "confirmation", icon: "OK", titleKey: "libraryConfirmationCheckbox" },
  { type: "screenshot", icon: "UP", titleKey: "libraryScreenshotUpload" },
  { type: "video", icon: "VID", titleKey: "libraryVideoUpload" },
  { type: "url", icon: "->", titleKey: "libraryUrl" },
  { type: "rating", icon: "*", titleKey: "libraryStarRating" },
  { icon: "ID", titleKey: "libraryWalletAddress", soon: true },
  { icon: "OK", titleKey: "librarySignatureVerification", soon: true },
  { icon: "PX", titleKey: "libraryEncryptedAnswer", soon: true },
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
}: FieldsStepProps) {
  const [expandedFieldId, setExpandedFieldId] = useState(fields[0]?.id ?? "");

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

  return (
    <section className="composer-builder-grid composer-builder-grid-composer">
      <aside className="composer-builder-column composer-library-column">
        <section className="panel composer-section-card composer-library-panel">
          <div className="composer-pane-heading">
            <div>
              <p className="eyebrow">Step 3</p>
              <h2>{t("blockLibraryTitle")}</h2>
              <p className="muted">{t("blockLibraryBody")}</p>
            </div>
            <button type="button" className="ghost-button" onClick={() => onAddSection()}>
              {t("addSection")}
            </button>
          </div>

          <div className="composer-library-scroll">
            <div className="composer-library-list">
              {libraryBlocks.map((block) => (
                <button
                  key={block.titleKey}
                  type="button"
                  className={`composer-library-card ${block.soon ? "is-soon" : ""}`}
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
                      <strong>{t(block.titleKey)}</strong>
                      <span className={`composer-library-chip ${block.soon ? "is-soon" : "is-ready"}`}>
                        {block.soon ? t("librarySoon") : t("libraryReady")}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <span className="composer-library-swipe-cue" aria-hidden="true" />
          </div>

          <div className="composer-library-footer">
            <p className="muted">{t("conditionalShortcutHint")}</p>
            <button type="button" className="ghost-button" onClick={onOpenFieldTypePicker}>
              {t("moreTypes")}
            </button>
          </div>
        </section>
      </aside>

      <div className="composer-builder-column composer-editor-column">
        <section className="panel composer-section-card composer-step-card composer-canvas-panel">
          <div className="composer-pane-heading composer-question-header">
            <div>
              <p className="eyebrow">{t("liveCanvas")}</p>
              <h2>{t("fields")}</h2>
              <p className="muted">
                {t("questionCount", { count: fields.length })} / {encryptSubmissions ? t("signalModePrivate") : t("signalModeOpen")}
              </p>
            </div>
            <div className="composer-canvas-header-actions">
              <button type="button" className="ghost-button" onClick={() => onAddSection()}>
                {t("addSection")}
              </button>
              <button type="button" className="primary-button composer-add-question-button" onClick={onOpenFieldTypePicker}>
                + {t("addQuestion")}
              </button>
            </div>
          </div>

          <div className="composer-canvas-intro">
            <strong>{title.trim() || t("untitledForm")}</strong>
            <p className="muted">{description.trim() || t("liveCanvasBody")}</p>
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
                    <span className="question-card-type">{t("questionCount", { count: section.fields.length })}</span>
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
                    <p className="muted composer-inline-empty">{t("sectionEmptyQuestions")}</p>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onInsertField("shortText", undefined, section.id)}
                    >
                      + {t("addQuestion")}
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
                + {t("shortTextLabel")}
              </button>
            </section>
          ) : null}

          <div className="composer-step-actions">
            <button type="button" className="ghost-button" onClick={onBack}>
              {t("back")}
            </button>
            <button type="button" className="primary-button" onClick={onContinue}>
              {t("continue")}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
