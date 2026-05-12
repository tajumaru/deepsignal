import { useI18n } from "../i18n";
import type { FormField } from "../types";
import { UploadDropzone, type UploadDropzoneItem } from "./UploadDropzone";

interface DynamicFieldProps {
  field: FormField;
  value: unknown;
  error?: string;
  hint?: string;
  questionNumber?: number;
  required?: boolean;
  onChange: (value: unknown) => void;
}

export function DynamicField({
  field,
  value,
  error,
  hint,
  questionNumber,
  required,
  onChange,
}: DynamicFieldProps) {
  const { t } = useI18n();
  const selectedAttachments = Array.isArray(value)
    ? value.filter((item): item is UploadDropzoneItem => Boolean(item) && typeof item === "object" && "id" in item)
    : [];

  function updateCheckbox(option: string, checked: boolean) {
    const current = Array.isArray(value) ? value : [];
    const next = checked
      ? [...current, option]
      : current.filter((item) => item !== option);
    onChange(next);
  }

  return (
    <label className={`field-block ${questionNumber ? "numbered-field" : ""}`}>
      <span className="field-label-row">
        {questionNumber ? <span className="field-question-index">Q{questionNumber}</span> : null}
        <span className="field-label-text">
          {field.label}
          {(required ?? field.required) ? " *" : ""}
        </span>
      </span>

      {field.type === "shortText" && (
        <input
          value={String(value ?? "")}
          placeholder={field.placeholder ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {field.type === "longText" && (
        <textarea
          rows={5}
          value={String(value ?? "")}
          placeholder={field.placeholder ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {field.type === "dropdown" && (
        <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t("selectOption")}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {field.type === "checkbox" && (
        <div className="checkbox-group">
          {(field.options ?? []).map((option) => (
            <label key={option} className="check-item">
              <input
                type="checkbox"
                checked={Array.isArray(value) ? value.includes(option) : false}
                onChange={(event) => updateCheckbox(option, event.target.checked)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}

      {field.type === "rating" && (
        <div className="rating-picker" role="radiogroup" aria-label={field.label}>
          {[1, 2, 3, 4, 5].map((score) => {
            const active = Number(value ?? 0) >= score;
            return (
              <button
                key={score}
                type="button"
                className={`star-button ${active ? "active" : ""}`}
                aria-label={t("ratingValue", { score })}
                aria-pressed={String(value ?? "") === String(score)}
                onClick={() => onChange(String(score))}
              >
                ★
              </button>
            );
          })}
          <span className="rating-label">
            {value ? t("ratingValue", { score: Number(value) }) : t("chooseRating")}
          </span>
        </div>
      )}

      {field.type === "url" && (
        <input
          type="url"
          inputMode="url"
          placeholder={field.placeholder ?? "https://example.com"}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {(field.type === "screenshot" || field.type === "video") && (
        <div className="upload-card">
          <UploadDropzone
            attachments={selectedAttachments}
            hint={hint ?? (field.type === "screenshot" ? t("screenshotHint") : t("videoHint"))}
            capture={field.type === "screenshot" ? "environment" : undefined}
            onChange={onChange}
          />
        </div>
      )}

      {field.helpText ? <small className="muted">{field.helpText}</small> : null}
      {error ? <small className="error-text">{error}</small> : null}
    </label>
  );
}
