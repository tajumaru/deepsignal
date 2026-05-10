import type { DragEvent } from "react";
import { FormFieldEditor } from "../../../components/FormFieldEditor";
import { LivePreview } from "../../../components/formBuilder/LivePreview";
import { SectionEditor } from "../../../components/formBuilder/SectionEditor";
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
  refs: FormBuilderRefs;
  setMobilePane: (pane: MobileBuilderPane) => void;
  setActiveFieldId: (fieldId: string) => void;
  setDraggedFieldId: (fieldId: string | null) => void;
  onAddSection: (preset?: string) => void;
  onUpdateSection: (sectionId: string, patch: Partial<FormSection>) => void;
  onRemoveSection: (sectionId: string) => void;
  onUpdateField: (index: number, field: FormField) => void;
  onRemoveField: (fieldId: string) => void;
  onDuplicateField: (fieldId: string) => void;
  onInsertField: (type: FieldType, afterIndex?: number) => void;
  onReorderFields: (sourceId: string, targetId: string) => void;
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
  refs,
  setMobilePane,
  setActiveFieldId,
  setDraggedFieldId,
  onAddSection,
  onUpdateSection,
  onRemoveSection,
  onUpdateField,
  onRemoveField,
  onDuplicateField,
  onInsertField,
  onReorderFields,
  onBack,
  onContinue,
}: FieldsStepProps) {
  return (
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
            <button type="button" className="ghost-button" onClick={() => onAddSection()}>
              + {t("addSection")}
            </button>
          </div>

          <SectionEditor
            sections={sections}
            onAddSection={onAddSection}
            onUpdateSection={onUpdateSection}
            onRemoveSection={onRemoveSection}
          />

          <div className="stack composer-question-stack">
            {fields.map((field, index) => (
              <FormFieldEditor
                key={field.id}
                field={field}
                index={index}
                sections={sections}
                rootRef={(node) => {
                  refs.fieldCardRefs.current[field.id] = node;
                }}
                isDragging={draggedFieldId === field.id}
                labelRef={(node) => {
                  refs.labelRefs.current[field.id] = node;
                }}
                onChange={(nextField) => onUpdateField(index, nextField)}
                onRemove={() => onRemoveField(field.id)}
                onDuplicate={() => onDuplicateField(field.id)}
                onAddBelow={() => onInsertField(field.type, index)}
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
                    onReorderFields(draggedFieldId, field.id);
                  }
                  setDraggedFieldId(null);
                }}
              />
            ))}
          </div>

          {fields.length === 0 ? <p className="muted">{t("fieldEmptyState")}</p> : null}

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
          encryptSubmissions={encryptSubmissions}
        />
      </div>
    </section>
  );
}
