import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { fieldTypeOptions } from "../lib/constants";
import { useI18n } from "../i18n";
import type { FieldType, FormField } from "../types";
import { AdvancedSettings } from "./formBuilder/AdvancedSettings";

interface FormFieldEditorProps {
  field: FormField;
  index: number;
  isDragging: boolean;
  sections?: Array<{ id: string; title: string }>;
  rootRef?: (node: HTMLElement | null) => void;
  labelRef: (node: HTMLInputElement | null) => void;
  onChange: (field: FormField) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onAddBelow: () => void;
  onFocus: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

function normalizeFieldForType(field: FormField, type: FieldType) {
  return {
    ...field,
    type,
    options:
      type === "dropdown" || type === "checkbox"
        ? field.options && field.options.length > 0
          ? field.options
          : ["Option 1", "Option 2"]
        : undefined,
  };
}

export function FormFieldEditor({
  field,
  index,
  isDragging,
  sections = [],
  rootRef,
  labelRef,
  onChange,
  onRemove,
  onDuplicate,
  onAddBelow,
  onFocus,
  onDragStart,
  onDragOver,
  onDrop,
}: FormFieldEditorProps) {
  const { fieldTypeLabel, t } = useI18n();

  function update<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value });
  }

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(normalizeFieldForType(field, event.target.value as FieldType));
  }

  function handleOptionsChange(event: ChangeEvent<HTMLTextAreaElement>) {
    update("options", event.target.value.split("\n"));
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onAddBelow();
    }
  }

  return (
    <section
      ref={rootRef}
      className={`panel question-card ${isDragging ? "is-dragging" : ""}`}
      onFocusCapture={onFocus}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="question-card-topline">
        <div className="question-card-meta">
          <span className="question-card-index">{t("fieldLabel", { index: index + 1 })}</span>
          <span className="question-card-type">{fieldTypeLabel(field.type)}</span>
        </div>
        <div className="question-card-actions">
          <button
            type="button"
            className="ghost-button icon-button"
            draggable
            onDragStart={onDragStart}
            aria-label={t("drag")}
            title={t("drag")}
          >
            {t("drag")}
          </button>
          <button
            type="button"
            className="ghost-button icon-button"
            onClick={onDuplicate}
            aria-label={t("duplicate")}
            title={t("duplicate")}
          >
            {t("duplicate")}
          </button>
          <button
            type="button"
            className="danger-button icon-button"
            onClick={onRemove}
            aria-label={t("remove")}
            title={t("remove")}
          >
            {t("remove")}
          </button>
        </div>
      </div>

      <label>
        <span>{t("label")}</span>
        <input
          ref={labelRef}
          value={field.label}
          onChange={(event) => update("label", event.target.value)}
          onKeyDown={handlePromptKeyDown}
          placeholder={t("askPlaceholder")}
        />
      </label>

      <div className="grid composer-question-row">
        <label>
          <span>{t("type")}</span>
          <select value={field.type} onChange={handleTypeChange}>
            {fieldTypeOptions.map((type) => (
              <option key={type} value={type}>
                {fieldTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="ghost-button add-next-button" onClick={onAddBelow}>
          {t("addQuestion")}
        </button>
      </div>

      {sections.length > 0 ? (
        <label>
          <span>{t("sectionTitle")}</span>
          <select
            value={field.sectionId ?? ""}
            onChange={(event) => update("sectionId", event.target.value || undefined)}
          >
            <option value="">{t("noSection")}</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title || t("untitledSection")}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {(field.type === "dropdown" || field.type === "checkbox") && (
        <label>
          <span>{t("optionsOnePerLine")}</span>
          <textarea
            rows={4}
            value={field.options?.join("\n") ?? ""}
            onChange={handleOptionsChange}
            placeholder={t("optionExamples")}
          />
        </label>
      )}

      <AdvancedSettings field={field} onChange={onChange} />
    </section>
  );
}
