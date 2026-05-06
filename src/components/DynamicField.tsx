import type { ChangeEvent } from "react";
import { useI18n } from "../i18n";
import type { FormField } from "../types";

interface DynamicFieldProps {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}

export function DynamicField({ field, value, error, onChange }: DynamicFieldProps) {
  const { t } = useI18n();
  const selectedFile = value instanceof File ? value : null;

  function updateCheckbox(option: string, checked: boolean) {
    const current = Array.isArray(value) ? value : [];
    const next = checked
      ? [...current, option]
      : current.filter((item) => item !== option);
    onChange(next);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    onChange(file);
  }

  return (
    <label className="field-block">
      <span>
        {field.label}
        {field.required ? " *" : ""}
      </span>

      {field.type === "shortText" && (
        <input value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
      )}

      {field.type === "longText" && (
        <textarea
          rows={5}
          value={String(value ?? "")}
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
          placeholder="https://example.com"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {(field.type === "screenshot" || field.type === "video") && (
        <div className="upload-card">
          <input
            type="file"
            accept={field.type === "screenshot" ? "image/*" : "video/*"}
            capture={field.type === "screenshot" ? "environment" : undefined}
            onChange={onFileChange}
          />
          <small className="muted">
            {field.type === "screenshot" ? t("screenshotHint") : t("videoHint")}
          </small>
          {selectedFile ? (
            <div className="file-pill">
              <strong>{selectedFile.name}</strong>
              <span>{Math.round(selectedFile.size / 1024)} KB</span>
            </div>
          ) : null}
        </div>
      )}

      {error ? <small className="error-text">{error}</small> : null}
    </label>
  );
}
