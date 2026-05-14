import { useRef } from "react";
import { useI18n } from "../i18n";
import { isAttachmentFieldType, isConfirmationCheckboxField, isLongTextLikeField } from "../lib/fieldTypes";
import type { FormField } from "../types";
import { CountrySelectQuestion } from "./CountrySelectQuestion";
import { DateInput } from "./DateInput";
import { RichTextContent } from "./RichText";
import { UploadDropzone, type UploadDropzoneItem } from "./UploadDropzone";

interface DynamicFieldProps {
  field: FormField;
  value: unknown;
  error?: string;
  hint?: string;
  questionNumber?: number;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}

type MarkdownToolbarAction = "bold" | "italic" | "bullet" | "link";

const markdownToolbarActions: Array<{
  action: MarkdownToolbarAction;
  icon: string;
  label: string;
}> = [
  { action: "bold", icon: "B", label: "Bold" },
  { action: "italic", icon: "I", label: "Italic" },
  { action: "bullet", icon: "List", label: "Bullet list" },
  { action: "link", icon: "Link", label: "Link" },
];

function getMarkdownInsertion(action: MarkdownToolbarAction, selectedText: string) {
  const hasSelection = selectedText.length > 0;

  if (action === "bold") {
    const text = hasSelection ? selectedText : "bold text";
    return { value: `**${text}**`, selectionStart: 2, selectionEnd: 2 + text.length };
  }

  if (action === "italic") {
    const text = hasSelection ? selectedText : "italic text";
    return { value: `_${text}_`, selectionStart: 1, selectionEnd: 1 + text.length };
  }

  if (action === "bullet") {
    const text = hasSelection ? selectedText : "list item";
    const value = text
      .split(/\r?\n/)
      .map((line) => `- ${line || "list item"}`)
      .join("\n");
    return { value, selectionStart: 2, selectionEnd: value.length };
  }

  const text = hasSelection ? selectedText : "link text";
  return {
    value: `[${text}](https://example.com)`,
    selectionStart: 1,
    selectionEnd: 1 + text.length,
  };
}

export function DynamicField({
  field,
  value,
  error,
  hint,
  questionNumber,
  required,
  disabled,
  onChange,
}: DynamicFieldProps) {
  const { language, t } = useI18n();
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isRequired = required ?? field.required;
  const fieldErrorId = `${field.id}-error`;
  const hasError = Boolean(error);
  const selectedAttachments = Array.isArray(value)
    ? value.filter((item): item is UploadDropzoneItem => Boolean(item) && typeof item === "object" && "id" in item)
    : [];

  function updateCheckbox(option: string, checked: boolean) {
    const current = Array.isArray(value) ? value : [];
    const next = checked ? [...current, option] : current.filter((item) => item !== option);
    onChange(next);
  }

  function applyMarkdownAction(action: MarkdownToolbarAction) {
    const textarea = markdownTextareaRef.current;
    const currentValue = String(value ?? "");
    const selectionStart = textarea?.selectionStart ?? currentValue.length;
    const selectionEnd = textarea?.selectionEnd ?? currentValue.length;
    const selectedText = currentValue.slice(selectionStart, selectionEnd);
    const insertion = getMarkdownInsertion(action, selectedText);
    const nextValue = `${currentValue.slice(0, selectionStart)}${insertion.value}${currentValue.slice(selectionEnd)}`;

    onChange(nextValue);

    window.requestAnimationFrame(() => {
      const nextTextarea = markdownTextareaRef.current;
      if (!nextTextarea) {
        return;
      }
      nextTextarea.focus();
      nextTextarea.setSelectionRange(
        selectionStart + insertion.selectionStart,
        selectionStart + insertion.selectionEnd,
      );
    });
  }

  return (
    <label
      className={`field-block ${questionNumber ? "numbered-field" : ""} ${hasError ? "has-error" : ""}`}
      data-field-id={field.id}
    >
      <span className="field-label-row">
        {questionNumber ? <span className="field-question-index">Q{questionNumber}</span> : null}
        <span className="field-label-text">{field.label}</span>
        <span className={`field-required-chip ${isRequired ? "is-required" : "is-optional"}`}>
          {isRequired ? "Required" : "Optional"}
        </span>
      </span>

      {field.type === "shortText" ? (
        <input
          value={String(value ?? "")}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}

      {field.type === "date" ? (
        <DateInput
          value={String(value ?? "")}
          language={language}
          disabled={disabled}
          ariaInvalid={hasError}
          ariaDescribedBy={hasError ? fieldErrorId : undefined}
          onChange={onChange}
        />
      ) : null}

      {isLongTextLikeField(field.type) ? (
        <div className={field.type === "markdown" ? "markdown-answer-field" : undefined}>
          {field.type === "markdown" ? (
            <div className="markdown-editor-toolbar" role="toolbar" aria-label="Rich text editor toolbar">
              {markdownToolbarActions.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className={`markdown-toolbar-button markdown-toolbar-button-${item.action}`}
                  disabled={disabled}
                  title={item.label}
                  aria-label={item.label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyMarkdownAction(item.action)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            ref={field.type === "markdown" ? markdownTextareaRef : undefined}
            rows={field.type === "markdown" ? 8 : 5}
            value={String(value ?? "")}
            placeholder={field.placeholder ?? (field.type === "markdown" ? "**Bold**, _italic_, links, and lists are supported." : "")}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={hasError ? fieldErrorId : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
          {field.type === "markdown" ? (
            <div className="markdown-preview-panel" aria-live="polite">
              <span className="markdown-preview-label">Preview</span>
              <RichTextContent
                value={String(value ?? "")}
                className="rich-text-content"
                fallback="Markdown preview appears here."
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {field.type === "dropdown" ? (
        <select
          value={String(value ?? "")}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{t("selectOption")}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : null}

      {field.type === "country_select" ? (
        <CountrySelectQuestion
          field={field}
          value={value}
          error={error}
          disabled={disabled}
          required={isRequired}
          onChange={onChange}
        />
      ) : null}

      {field.type === "checkbox" ? (
        <div
          className={`checkbox-group ${hasError ? "is-error" : ""}`}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
        >
          {(field.options ?? []).map((option) => (
            <label key={option} className="check-item">
              <input
                type="checkbox"
                checked={Array.isArray(value) ? value.includes(option) : false}
                disabled={disabled}
                onChange={(event) => updateCheckbox(option, event.target.checked)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}

      {isConfirmationCheckboxField(field.type) ? (
        <div
          className={`checkbox-group confirmation-checkbox ${hasError ? "is-error" : ""}`}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
        >
          <label className="check-item">
            <input
              type="checkbox"
              checked={Boolean(value)}
              disabled={disabled}
              onChange={(event) => onChange(event.target.checked)}
            />
            <span>{field.placeholder?.trim() || "I confirm"}</span>
          </label>
        </div>
      ) : null}

      {field.type === "rating" ? (
        <div
          className={`rating-picker ${hasError ? "is-error" : ""}`}
          role="radiogroup"
          aria-label={field.label}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
        >
          {[1, 2, 3, 4, 5].map((score) => {
            const active = Number(value ?? 0) >= score;
            return (
              <button
                key={score}
                type="button"
                className={`star-button ${active ? "active" : ""}`}
                aria-label={t("ratingValue", { score })}
                aria-pressed={String(value ?? "") === String(score)}
                disabled={disabled}
                onClick={() => onChange(String(score))}
              >
                {"★"}
              </button>
            );
          })}
          <span className="rating-label">
            {value ? t("ratingValue", { score: Number(value) }) : t("chooseRating")}
          </span>
        </div>
      ) : null}

      {field.type === "url" ? (
        <input
          type="url"
          inputMode="url"
          placeholder={field.placeholder ?? "https://example.com"}
          value={String(value ?? "")}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}

      {isAttachmentFieldType(field.type) ? (
        <div
          className={`upload-card ${hasError ? "is-error" : ""}`}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
        >
          <UploadDropzone
            attachments={selectedAttachments}
            disabled={disabled}
            hint={hint ?? (field.type === "screenshot" ? t("screenshotHint") : t("videoHint"))}
            capture={field.type === "screenshot" ? "environment" : undefined}
            onChange={onChange}
          />
        </div>
      ) : null}

      {field.helpText ? <small className="muted">{field.helpText}</small> : null}
      {error ? <small id={fieldErrorId} className="error-text">{error}</small> : null}
    </label>
  );
}
