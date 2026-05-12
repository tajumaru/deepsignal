import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FormFieldEditor } from "../../../components/FormFieldEditor";
import { LivePreview } from "../../../components/formBuilder/LivePreview";
import { smartComposerTemplates } from "../../../lib/formTemplates";
import type { FieldType, FormBuilderRefs, FormField, FormSection, MobileBuilderPane, Translate } from "../types";

interface FieldsStepProps {
  t: Translate;
  title: string;
  description: string;
  fields: FormField[];
  sections: FormSection[];
  encryptSubmissions: boolean;
  mobilePane: MobileBuilderPane;
  draggedFieldId: string | null;
  dragOverFieldId: string | null;
  dragOverPlacement: "before" | "after" | null;
  refs: FormBuilderRefs;
  setMobilePane: (pane: MobileBuilderPane) => void;
  setActiveFieldId: (fieldId: string) => void;
  setDraggedFieldId: (fieldId: string | null) => void;
  setDragOverFieldId: (fieldId: string | null) => void;
  setDragOverPlacement: (placement: "before" | "after" | null) => void;
  onInsertSmartTemplate: (templateKey: string) => void;
  onUpdateSection: (sectionId: string, patch: Partial<FormSection>) => void;
  onRemoveSection: (sectionId: string) => void;
  onUpdateField: (index: number, field: FormField) => void;
  onRemoveField: (fieldId: string) => void;
  onDuplicateField: (fieldId: string) => void;
  onInsertField: (type: FieldType, afterIndex?: number, sectionId?: string) => void;
  onReorderFields: (sourceId: string, targetId: string, placement?: "before" | "after") => void;
  onOpenFieldTypePicker: () => void;
  onBack: () => void;
  onContinue: () => void;
}

export function FieldsStep({
  t,
  title,
  description,
  fields,
  sections,
  encryptSubmissions,
  mobilePane,
  draggedFieldId,
  dragOverFieldId,
  dragOverPlacement,
  refs,
  setMobilePane,
  setActiveFieldId,
  setDraggedFieldId,
  setDragOverFieldId,
  setDragOverPlacement,
  onInsertSmartTemplate,
  onUpdateSection,
  onRemoveSection,
  onUpdateField,
  onRemoveField,
  onDuplicateField,
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

  const unsectionedFields = useMemo(() => fields.filter((field) => !field.sectionId), [fields]);
  const sectionGroups = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        fields: fields.filter((field) => field.sectionId === section.id),
      })),
    [fields, sections],
  );

  function renderField(field: FormField, index: number) {
    return (
      <FormFieldEditor
        key={field.id}
        field={field}
        fields={fields}
        index={index}
        sections={sections}
        rootRef={(node) => {
          refs.fieldCardRefs.current[field.id] = node;
        }}
        isDragging={draggedFieldId === field.id}
        isExpanded={expandedFieldId === field.id}
        dropIndicator={dragOverFieldId === field.id ? dragOverPlacement : null}
        labelRef={(node) => {
          refs.labelRefs.current[field.id] = node;
        }}
        onChange={(nextField) => onUpdateField(index, nextField)}
        onRemove={() => onRemoveField(field.id)}
        onDuplicate={() => onDuplicateField(field.id)}
        onAddBelow={() => onInsertField(field.type, index, field.sectionId)}
        onToggleExpand={() => setExpandedFieldId((current) => (current === field.id ? "" : field.id))}
        onFocus={() => {
          setActiveFieldId(field.id);
          setExpandedFieldId(field.id);
        }}
        onDragStart={(event: DragEvent<HTMLElement>) => {
          event.dataTransfer.effectAllowed = "move";
          setDraggedFieldId(field.id);
        }}
        onDragEnd={() => {
          setDraggedFieldId(null);
          setDragOverFieldId(null);
          setDragOverPlacement(null);
        }}
        onDragOver={(event: DragEvent<HTMLElement>) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const bounds = event.currentTarget.getBoundingClientRect();
          const placement = event.clientY - bounds.top > bounds.height / 2 ? "after" : "before";
          setDragOverFieldId(field.id);
          setDragOverPlacement(placement);
        }}
        onDrop={(event: DragEvent<HTMLElement>) => {
          event.preventDefault();
          if (draggedFieldId) {
            onReorderFields(draggedFieldId, field.id, dragOverPlacement ?? "before");
          }
          setDraggedFieldId(null);
          setDragOverFieldId(null);
          setDragOverPlacement(null);
        }}
      />
    );
  }

  return (
    <section className="composer-builder-grid composer-builder-grid-wide">
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
          </div>

          <section className="composer-smart-template-strip">
            <div>
              <strong>{t("smartTemplates")}</strong>
              <p className="muted">{t("smartTemplatesBody")}</p>
            </div>
            <div className="composer-smart-template-row">
              {smartComposerTemplates.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  className="ghost-button composer-smart-template-button"
                  onClick={() => onInsertSmartTemplate(template.key)}
                >
                  + {template.label}
                </button>
              ))}
            </div>
          </section>

          <div className="stack composer-question-stack">
            {unsectionedFields.map((field) => renderField(field, fields.findIndex((item) => item.id === field.id)))}

            {sectionGroups.map((section) => (
              <section key={section.id} className="composer-inline-section">
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
                    {section.fields.map((field) => renderField(field, fields.findIndex((item) => item.id === field.id)))}
                  </div>
                ) : (
                  <p className="muted composer-inline-empty">{t("sectionEmptyQuestions")}</p>
                )}
              </section>
            ))}
          </div>

          {fields.length === 0 ? <p className="muted">{t("fieldEmptyState")}</p> : null}

          <section className="composer-add-bar">
            <div className="composer-add-bar-main">
              <button type="button" className="primary-button composer-add-question-button" onClick={onOpenFieldTypePicker}>
                + {t("addQuestion")}
              </button>
            </div>
          </section>

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

      <div className={`composer-builder-column composer-preview-column ${mobilePane === "editor" ? "is-hidden-mobile" : ""}`}>
        <LivePreview
          title={title}
          description={description}
          fields={fields}
          sections={sections}
        />
      </div>
    </section>
  );
}
