import { useRef, type CSSProperties } from "react";
import { useI18n } from "../i18n";
import { isAttachmentFieldType, isConfirmationCheckboxField, isLongTextLikeField } from "../lib/fieldTypes";
import { getSuiAddressValidationState, normalizeValidSuiAddress } from "../lib/suiAddress";
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
  attachmentMaxSizeBytes?: number;
  attachmentMaxSizeErrorMessage?: (maxSizeBytes: number) => string;
  questionNumber?: number;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}

type MarkdownToolbarAction = "bold" | "italic" | "bullet" | "link";

function getMatrixAnswer(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const markdownToolbarActions: Array<{
  action: MarkdownToolbarAction;
  icon: string;
  labelKey: "markdownToolbarBold" | "markdownToolbarItalic" | "markdownToolbarBulletList" | "markdownToolbarLink";
}> = [
  { action: "bold", icon: "B", labelKey: "markdownToolbarBold" },
  { action: "italic", icon: "I", labelKey: "markdownToolbarItalic" },
  { action: "bullet", icon: "List", labelKey: "markdownToolbarBulletList" },
  { action: "link", icon: "Link", labelKey: "markdownToolbarLink" },
];

function getMarkdownInsertion(
  action: MarkdownToolbarAction,
  selectedText: string,
  fallbackText: {
    bold: string;
    italic: string;
    listItem: string;
    linkText: string;
    linkUrl: string;
  },
) {
  const hasSelection = selectedText.length > 0;

  if (action === "bold") {
    const text = hasSelection ? selectedText : fallbackText.bold;
    return { value: `**${text}**`, selectionStart: 2, selectionEnd: 2 + text.length };
  }

  if (action === "italic") {
    const text = hasSelection ? selectedText : fallbackText.italic;
    return { value: `_${text}_`, selectionStart: 1, selectionEnd: 1 + text.length };
  }

  if (action === "bullet") {
    const text = hasSelection ? selectedText : fallbackText.listItem;
    const value = text
      .split(/\r?\n/)
      .map((line) => `- ${line || fallbackText.listItem}`)
      .join("\n");
    return { value, selectionStart: 2, selectionEnd: value.length };
  }

  const text = hasSelection ? selectedText : fallbackText.linkText;
  return {
    value: `[${text}](${fallbackText.linkUrl})`,
    selectionStart: 1,
    selectionEnd: 1 + text.length,
  };
}

export function DynamicField({
  field,
  value,
  error,
  hint,
  attachmentMaxSizeBytes,
  attachmentMaxSizeErrorMessage,
  questionNumber,
  required,
  disabled,
  onChange,
}: DynamicFieldProps) {
  const { language, t } = useI18n();
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isRequired = required ?? field.required;
  const fieldErrorId = `${field.id}-error`;
  const fieldStatusId = `${field.id}-status`;
  const hasError = Boolean(error);
  const selectedAttachments = Array.isArray(value)
    ? value.filter((item): item is UploadDropzoneItem => Boolean(item) && typeof item === "object" && "id" in item)
    : [];
  const rendersChoiceChips =
    field.type === "dropdown" &&
    (field.options ?? []).length > 0 &&
    (field.options ?? []).every((option) => ["Minor", "Serious", "Blocking"].includes(option));
  const attachmentActionLabel =
    field.label?.trim() ||
    (field.type === "screenshot"
      ? "Attach screenshot"
      : field.type === "video"
        ? "Attach evidence"
        : "Attach supporting file");
  const suiAddressStatus = field.type === "walletAddress" ? getSuiAddressValidationState(value) : "empty";
  const suiAddressStatusLabel =
    suiAddressStatus === "valid"
      ? t("suiAddressValid")
      : suiAddressStatus === "invalid"
        ? t("suiAddressInvalid")
        : t("suiAddressHint");

  function updateCheckbox(option: string, checked: boolean) {
    const current = Array.isArray(value) ? value : [];
    const next = checked ? [...current, option] : current.filter((item) => item !== option);
    onChange(next);
  }

  function updateMatrixAnswer(row: string, column: string) {
    onChange({
      ...getMatrixAnswer(value),
      [row]: column,
    });
  }

  function applyMarkdownAction(action: MarkdownToolbarAction) {
    const textarea = markdownTextareaRef.current;
    const currentValue = String(value ?? "");
    const selectionStart = textarea?.selectionStart ?? currentValue.length;
    const selectionEnd = textarea?.selectionEnd ?? currentValue.length;
    const selectedText = currentValue.slice(selectionStart, selectionEnd);
    const insertion = getMarkdownInsertion(action, selectedText, {
      bold: t("markdownFallbackBoldText"),
      italic: t("markdownFallbackItalicText"),
      listItem: t("markdownFallbackListItem"),
      linkText: t("markdownFallbackLinkText"),
      linkUrl: t("markdownFallbackLinkUrl"),
    });
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
          {isRequired ? t("required") : t("optional")}
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
                  title={t(item.labelKey)}
                  aria-label={t(item.labelKey)}
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
            placeholder={field.placeholder ?? (field.type === "markdown" ? t("markdownAnswerPlaceholder") : "")}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={hasError ? fieldErrorId : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
          {field.type === "markdown" ? (
            <>
            <div className="markdown-preview-panel markdown-preview-panel-desktop" aria-live="polite">
              <span className="markdown-preview-label">{t("markdownPreviewLabel")}</span>
              <RichTextContent
                value={String(value ?? "")}
                className="rich-text-content"
                fallback={t("markdownPreviewFallback")}
              />
            </div>
            <details className="markdown-preview-details">
              <summary>{t("markdownPreviewLabel")}</summary>
              <div className="markdown-preview-panel" aria-live="polite">
                <RichTextContent
                  value={String(value ?? "")}
                  className="rich-text-content"
                  fallback={t("markdownPreviewFallback")}
                />
              </div>
            </details>
            </>
          ) : null}
        </div>
      ) : null}

      {field.type === "dropdown" && rendersChoiceChips ? (
        <div
          className={`choice-chip-group ${hasError ? "is-error" : ""}`}
          role="radiogroup"
          aria-label={field.label}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
        >
          {(field.options ?? []).map((option) => {
            const active = String(value ?? "") === option;
            return (
              <button
                key={option}
                type="button"
                className={`choice-chip ${active ? "is-active" : ""}`}
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange(option)}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : null}

      {field.type === "dropdown" && !rendersChoiceChips ? (
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

      {field.type === "matrix" ? (
        <div
          className={`matrix-question ${hasError ? "is-error" : ""}`}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
        >
          <div className="matrix-table-wrap matrix-desktop-layout">
            <div
              className="matrix-grid"
              role="table"
              style={{ "--matrix-columns": String(Math.max((field.columns ?? []).length, 1)) } as CSSProperties}
            >
              <div className="matrix-grid-header" role="row">
                <div className="matrix-grid-corner" role="columnheader" />
                {(field.columns ?? []).map((column) => (
                  <div key={column} className="matrix-grid-column-header" role="columnheader">
                    {column}
                  </div>
                ))}
              </div>

              {(field.rows ?? []).map((row, rowIndex) => {
                const answer = getMatrixAnswer(value);
                return (
                  <div key={row} className={`matrix-grid-row ${answer[row] ? "is-selected" : ""}`} role="row">
                    <div className="matrix-grid-row-label" role="rowheader">
                      {row}
                    </div>
                    {(field.columns ?? []).map((column, columnIndex) => {
                      const checked = answer[row] === column;
                      const inputId = `${field.id}-matrix-${rowIndex}-${columnIndex}`;
                      return (
                        <label
                          key={column}
                          className={`matrix-grid-cell-choice ${checked ? "is-selected" : ""}`}
                          htmlFor={inputId}
                          role="cell"
                        >
                          <input
                            id={inputId}
                            type="radio"
                            name={`${field.id}-${row}`}
                            value={column}
                            checked={checked}
                            disabled={disabled}
                            aria-label={`${row}: ${column}`}
                            onChange={() => updateMatrixAnswer(row, column)}
                          />
                          <span className="matrix-radio-visual" aria-hidden="true" />
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="matrix-card-stack matrix-mobile-layout">
            {(field.rows ?? []).map((row, rowIndex) => (
              <div key={row} className="matrix-row-card">
                <div id={`${field.id}-matrix-row-${rowIndex}`} className="matrix-row-card-title">
                  {row}
                </div>
                <div className="matrix-row-options" role="radiogroup" aria-labelledby={`${field.id}-matrix-row-${rowIndex}`}>
                  {(field.columns ?? []).map((column, columnIndex) => {
                    const checked = getMatrixAnswer(value)[row] === column;
                    const inputId = `${field.id}-matrix-mobile-${rowIndex}-${columnIndex}`;
                    return (
                      <label key={column} className={`matrix-option-card ${checked ? "is-selected" : ""}`} htmlFor={inputId}>
                        <input
                          id={inputId}
                          type="radio"
                          name={`${field.id}-${row}-mobile`}
                          value={column}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => updateMatrixAnswer(row, column)}
                        />
                        <span className="matrix-radio-visual" aria-hidden="true" />
                        <span>{column}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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
            <span>{field.placeholder?.trim() || t("confirmationDefaultFallback")}</span>
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
          placeholder={field.placeholder ?? t("urlPlaceholder")}
          value={String(value ?? "")}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? fieldErrorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}

      {field.type === "walletAddress" ? (
        <div className={`sui-address-input-shell is-${suiAddressStatus}`}>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={field.placeholder ?? t("suiAddressPlaceholder")}
            value={String(value ?? "")}
            disabled={disabled}
            aria-invalid={hasError || suiAddressStatus === "invalid"}
            aria-describedby={hasError ? fieldErrorId : suiAddressStatus !== "empty" ? fieldStatusId : undefined}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => onChange(normalizeValidSuiAddress(value))}
          />
          <small id={fieldStatusId} className={`sui-address-validation is-${suiAddressStatus}`} aria-live="polite">
            {suiAddressStatusLabel}
          </small>
        </div>
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
            actionLabel={attachmentActionLabel}
            emptyLabel="No supporting files attached yet"
            hint={hint ?? (field.type === "screenshot" ? t("screenshotHint") : t("videoHint"))}
            maxSizeBytes={attachmentMaxSizeBytes}
            maxSizeErrorMessage={attachmentMaxSizeErrorMessage}
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
