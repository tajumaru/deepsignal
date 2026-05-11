import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { fieldTypeOptions } from "../lib/constants";
import { useI18n } from "../i18n";
import type { FieldType, FormField } from "../types";
import { AdvancedSettings } from "./formBuilder/AdvancedSettings";

interface FormFieldEditorProps {
  field: FormField;
  index: number;
  isDragging: boolean;
  isExpanded: boolean;
  dropIndicator?: "before" | "after" | null;
  sections?: Array<{ id: string; title: string }>;
  rootRef?: (node: HTMLElement | null) => void;
  labelRef: (node: HTMLInputElement | null) => void;
  onChange: (field: FormField) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onAddBelow: () => void;
  onToggleExpand: () => void;
  onFocus: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
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
  isExpanded,
  dropIndicator,
  sections = [],
  rootRef,
  labelRef,
  onChange,
  onRemove,
  onDuplicate,
  onAddBelow,
  onToggleExpand,
  onFocus,
  onDragStart,
  onDragEnd,
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

  function handleMetaEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onAddBelow();
    }
  }

  return (
    <section
      ref={rootRef}
      className={`panel question-card ${isDragging ? "is-dragging" : ""} ${isExpanded ? "is-expanded" : ""} ${
        dropIndicator ? `is-drop-${dropIndicator}` : ""
      }`}
      onFocusCapture={onFocus}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="question-card-summary" onClick={isExpanded ? undefined : onToggleExpand}>
        <button
          type="button"
          className="ghost-button icon-button question-drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={t("drag")}
          title={t("drag")}
        >
          ::
        </button>

        <div className="question-card-main">
          <div className="question-card-topline">
            <span className="question-card-index">{t("fieldLabel", { index: index + 1 })}</span>
            <button
              type="button"
              className={`question-card-badge ${field.required ? "is-active" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                update("required", !field.required);
              }}
            >
              {field.required ? t("required") : t("optional")}
            </button>
            <span className="question-card-type">{fieldTypeLabel(field.type)}</span>
            {field.sectionId ? (
              <span className="question-card-type">
                {sections.find((section) => section.id === field.sectionId)?.title || t("untitledSection")}
              </span>
            ) : null}
          </div>

          <input
            ref={labelRef}
            className="question-card-inline-input"
            value={field.label}
            onClick={(event) => event.stopPropagation()}
            onFocus={() => {
              if (!isExpanded) {
                onToggleExpand();
              }
            }}
            onChange={(event) => update("label", event.target.value)}
            onKeyDown={(event) => {
              handlePromptKeyDown(event);
              handleMetaEnter(event);
            }}
            placeholder={t("askPlaceholder")}
          />
        </div>

        <div className="question-card-actions question-card-actions-visible">
          <button type="button" className="ghost-button icon-button" onClick={onToggleExpand}>
            {isExpanded ? t("collapse") : t("edit")}
          </button>
          <details className="question-card-menu" onClick={(event) => event.stopPropagation()}>
            <summary className="ghost-button icon-button" aria-label={t("moreActions")}>
              ...
            </summary>
            <div className="question-card-menu-panel">
              <button type="button" className="ghost-button" onClick={onDuplicate}>
                {t("duplicate")}
              </button>
              <button type="button" className="ghost-button" onClick={onToggleExpand}>
                {isExpanded ? t("collapse") : t("advanced")}
              </button>
              <button type="button" className="danger-button" onClick={onRemove}>
                {t("remove")}
              </button>
            </div>
          </details>
        </div>
      </div>

      {isExpanded ? (
        <div className="question-card-details">
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
          </div>

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
        </div>
      ) : null}
    </section>
  );
}
