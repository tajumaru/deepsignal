import type { ChangeEvent } from "react";
import { fieldTypeOptions } from "../lib/constants";
import { useI18n } from "../i18n";
import type { FieldType, FormField } from "../types";

interface FormFieldEditorProps {
  field: FormField;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (field: FormField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function FormFieldEditor({
  field,
  index,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FormFieldEditorProps) {
  const { fieldTypeLabel, t } = useI18n();

  function update<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value });
  }

  function handleOptionsChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const options = event.target.value.split("\n");
    update("options", options);
  }

  return (
    <section className="panel field-editor">
      <div className="section-row">
        <h3>{t("fieldLabel", { index: index + 1 })}</h3>
        <div className="inline-actions">
          <button type="button" className="ghost-button" onClick={onMoveUp} disabled={!canMoveUp}>
            {t("moveUp")}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
          >
            {t("moveDown")}
          </button>
          <button type="button" className="danger-button" onClick={onRemove}>
            {t("remove")}
          </button>
        </div>
      </div>

      <div className="grid two-col">
        <label>
          <span>{t("label")}</span>
          <input
            value={field.label}
            onChange={(event) => update("label", event.target.value)}
            placeholder={t("askPlaceholder")}
          />
        </label>

        <label>
          <span>{t("type")}</span>
          <select
            value={field.type}
            onChange={(event) => update("type", event.target.value as FieldType)}
          >
            {fieldTypeOptions.map((type) => (
              <option key={type} value={type}>
                {fieldTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
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

      <div className="toggle-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => update("required", event.target.checked)}
          />
          <span>{t("required")}</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={field.sensitive}
            onChange={(event) => update("sensitive", event.target.checked)}
          />
          <span>{t("sensitive")}</span>
        </label>
      </div>
    </section>
  );
}
