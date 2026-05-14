import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { fieldTypeOptions } from "../lib/constants";
import { useI18n } from "../i18n";
import { getCountryFlag } from "../lib/countries";
import { hasChoiceOptions } from "../lib/fieldTypes";
import type { FieldType, FormField } from "../types";
import {
  canFieldHaveConditionalChildren,
  getConditionalParentField,
  getConditionalValueOptions,
  hasValidConditionalValue,
  isConditionalChildField,
} from "../utils/formLogic";
import { AdvancedSettings } from "./formBuilder/AdvancedSettings";

interface FormFieldEditorProps {
  field: FormField;
  fields: FormField[];
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
  onAddConditionalQuestion: () => void;
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
    options: hasChoiceOptions(type) ? (field.options && field.options.length > 0 ? field.options : ["Option 1", "Option 2"]) : undefined,
  };
}

export function FormFieldEditor({
  field,
  fields,
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
  onAddConditionalQuestion,
  onToggleExpand,
  onFocus,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: FormFieldEditorProps) {
  const { fieldTypeLabel, t } = useI18n();
  const isConditionalChild = isConditionalChildField(field);
  const conditionalParent = getConditionalParentField(field, fields);
  const conditionalOptions = getConditionalValueOptions(conditionalParent);
  const canAddConditionalQuestion = canFieldHaveConditionalChildren(field);
  const hasConditionalValue = hasValidConditionalValue(field, fields);

  function update<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value });
  }

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(normalizeFieldForType(field, event.target.value as FieldType));
  }

  function handleOptionsChange(index: number, value: string) {
    const currentOptions = field.options ?? ["Option 1", "Option 2"];
    const nextOptions = currentOptions.map((option, optionIndex) => (optionIndex === index ? value : option));
    update("options", nextOptions);
  }

  function handleAddOption() {
    update("options", [...(field.options ?? ["Option 1", "Option 2"]), `Option ${(field.options?.length ?? 2) + 1}`]);
  }

  function handleRemoveOption(index: number) {
    update(
      "options",
      (field.options ?? []).filter((_, optionIndex) => optionIndex !== index),
    );
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

  function conditionalSummary() {
    if (!conditionalParent) {
      return t("conditionalQuestionMissingParent");
    }
    if (!field.conditionalValue) {
      return t("conditionalQuestionNeedsValue");
    }
    return t("conditionalShowWhenSentence", {
      parent: conditionalParent.label.trim() || t("label"),
      value: field.conditionalValue,
    });
  }

  function renderPreview() {
    if (field.type === "shortText" || field.type === "url") {
      return (
        <input
          disabled
          value=""
          placeholder={field.placeholder ?? (field.type === "url" ? "https://example.com" : t("placeholderExample"))}
          readOnly
        />
      );
    }

    if (field.type === "longText" || field.type === "markdown") {
      return (
        <textarea
          rows={field.type === "markdown" ? 6 : 4}
          disabled
          value=""
          placeholder={field.placeholder ?? (field.type === "markdown" ? "# Add markdown-friendly prompt" : t("helpTextExample"))}
          readOnly
        />
      );
    }

    if (field.type === "dropdown") {
      return (
        <select disabled value="">
          <option value="">{t("selectOption")}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "country_select") {
      return (
        <div className="composer-country-preview" aria-hidden="true">
          <span className="composer-country-preview-main">
            <span>{getCountryFlag("JP")}</span>
            <strong>{field.placeholder?.trim() || "Search or select a country"}</strong>
          </span>
          <small className="muted">Flag, country name, and ISO code appear in responses.</small>
        </div>
      );
    }

    if (field.type === "checkbox") {
      return (
        <div className="composer-canvas-checkboxes" aria-hidden="true">
          {(field.options ?? []).map((option) => (
            <div key={option} className="composer-canvas-checkbox">
              <span className="composer-canvas-checkbox-mark" />
              <span>{option}</span>
            </div>
          ))}
        </div>
      );
    }

    if (field.type === "confirmationCheckbox") {
      return (
        <div className="composer-canvas-checkboxes" aria-hidden="true">
          <div className="composer-canvas-checkbox">
            <span className="composer-canvas-checkbox-mark" />
            <span>{field.placeholder?.trim() || "I confirm the above is correct"}</span>
          </div>
        </div>
      );
    }

    if (field.type === "rating") {
      return (
        <div className="composer-canvas-rating" aria-hidden="true">
          <span>*****</span>
          <small className="muted">{t("chooseRating")}</small>
        </div>
      );
    }

    return (
      <div className="composer-upload-placeholder" aria-hidden="true">
        <strong>{field.type === "screenshot" ? t("fieldTypeScreenshot") : t("fieldTypeVideo")}</strong>
        <span className="muted">
          {field.type === "screenshot" ? t("screenshotHint") : t("videoHint")}
        </span>
      </div>
    );
  }

  return (
    <section
      ref={rootRef}
      className={`panel question-card composer-canvas-card ${isConditionalChild ? "is-conditional-child" : ""} ${
        isDragging ? "is-dragging" : ""
      } ${isExpanded ? "is-expanded" : ""} ${dropIndicator ? `is-drop-${dropIndicator}` : ""}`}
      onFocusCapture={onFocus}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="question-card-summary composer-canvas-card-head">
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
            <span className="question-card-type">{fieldTypeLabel(field.type)}</span>
            <button
              type="button"
              className={`question-card-badge ${field.required ? "is-active" : ""}`}
              onClick={() => update("required", !field.required)}
            >
              {field.required ? t("required") : t("optional")}
            </button>
            {isConditionalChild ? <span className="question-card-type">{t("conditionalQuestionBadge")}</span> : null}
            {field.sectionId ? (
              <span className="question-card-type">
                {sections.find((section) => section.id === field.sectionId)?.title || t("untitledSection")}
              </span>
            ) : null}
          </div>

          {isConditionalChild ? (
            <div className={`composer-conditional-inline-label ${hasConditionalValue ? "" : "is-warning"}`}>
              <strong>{t("conditionalIfAnswerIs")}</strong>
              <span>{conditionalSummary()}</span>
            </div>
          ) : null}

          <input
            ref={labelRef}
            className="question-card-inline-input composer-canvas-question-input"
            value={field.label}
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

          {isExpanded ? (
            <input
              className="composer-canvas-help-input"
              value={field.helpText ?? ""}
              onChange={(event) => update("helpText", event.target.value)}
              placeholder={t("helpTextExample")}
            />
          ) : field.helpText ? (
            <small className="muted">{field.helpText}</small>
          ) : null}

          <div className="composer-canvas-preview">{renderPreview()}</div>
        </div>

        <div className="question-card-actions question-card-actions-visible">
          <button type="button" className="ghost-button icon-button" onClick={onToggleExpand}>
            {isExpanded ? t("collapse") : t("edit")}
          </button>
          <details className="question-card-menu">
            <summary className="ghost-button icon-button" aria-label={t("moreActions")}>
              ...
            </summary>
            <div className="question-card-menu-panel">
              <button type="button" className="ghost-button" onClick={onAddBelow}>
                + {t("addQuestion")}
              </button>
              {canAddConditionalQuestion ? (
                <button type="button" className="ghost-button" onClick={onAddConditionalQuestion}>
                  + {t("addConditionalQuestion")}
                </button>
              ) : null}
              <button type="button" className="ghost-button" onClick={onDuplicate}>
                {t("duplicate")}
              </button>
              <button type="button" className="danger-button" onClick={onRemove}>
                {t("remove")}
              </button>
            </div>
          </details>
        </div>
      </div>

      {isExpanded ? (
        <div className="question-card-details composer-canvas-card-body">
          {isConditionalChild && conditionalParent ? (
            <label className="composer-conditional-rule-editor">
              <span>{t("conditionalShowWhen")}</span>
              <div className="composer-conditional-rule-row">
                <span className="composer-conditional-rule-source">
                  "{conditionalParent.label.trim() || t("label")}" {t("conditionalIs")}
                </span>
                <select
                  value={field.conditionalValue ?? ""}
                  onChange={(event) => update("conditionalValue", event.target.value || undefined)}
                >
                  <option value="">{t("conditionalSelectValue")}</option>
                  {conditionalOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          ) : null}

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
            ) : (
              <label>
                <span>{t("placeholder")}</span>
                <input
                  value={field.placeholder ?? ""}
                  onChange={(event) => update("placeholder", event.target.value)}
                  placeholder={t("placeholderExample")}
                />
              </label>
            )}
          </div>

          {sections.length > 0 ? (
            <label>
              <span>{t("placeholder")}</span>
              <input
                value={field.placeholder ?? ""}
                onChange={(event) => update("placeholder", event.target.value)}
                placeholder={t("placeholderExample")}
              />
            </label>
          ) : null}

          {hasChoiceOptions(field.type) && (
            <div className="composer-option-editor">
              <span>{t("optionsOnePerLine")}</span>
              <div className="composer-option-stack">
                {(field.options ?? []).map((option, optionIndex) => (
                  <div key={`${field.id}-option-${optionIndex}`} className="composer-option-row">
                    <input
                      value={option}
                      onChange={(event) => handleOptionsChange(optionIndex, event.target.value)}
                      placeholder={`Option ${optionIndex + 1}`}
                    />
                    <button type="button" className="ghost-button" onClick={() => handleRemoveOption(optionIndex)}>
                      {t("remove")}
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="ghost-button" onClick={handleAddOption}>
                + {t("addOption")}
              </button>
            </div>
          )}

          <div className="composer-canvas-quick-actions">
            <button type="button" className="ghost-button" onClick={onAddBelow}>
              + {t("addQuestion")}
            </button>
            {canAddConditionalQuestion ? (
              <button type="button" className="ghost-button" onClick={onAddConditionalQuestion}>
                + {t("addConditionalQuestion")}
              </button>
            ) : null}
          </div>

          <AdvancedSettings field={field} fields={fields} onChange={onChange} />
        </div>
      ) : null}
    </section>
  );
}
