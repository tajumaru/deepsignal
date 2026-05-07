import type { FormField } from "../../types";
import { useI18n } from "../../i18n";

interface AdvancedSettingsProps {
  field: FormField;
  onChange: (field: FormField) => void;
}

export function AdvancedSettings({ field, onChange }: AdvancedSettingsProps) {
  const { t } = useI18n();

  function update<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value });
  }

  return (
    <details className="question-advanced">
      <summary>{t("advanced")}</summary>
      <div className="composer-advanced-stack">
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

        <div className="toggle-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={Boolean(field.adminOnly)}
              onChange={(event) => update("adminOnly", event.target.checked)}
            />
            <span>{t("adminOnly")}</span>
          </label>
          <label>
            <span>{t("visibility")}</span>
            <select
              value={field.visibility ?? "public"}
              onChange={(event) => update("visibility", event.target.value as FormField["visibility"])}
            >
              <option value="public">{t("visibleToEveryone")}</option>
              <option value="admin">{t("visibleToAdmin")}</option>
            </select>
          </label>
        </div>

        <label>
          <span>{t("validation")}</span>
          <input
            value={field.validationHint ?? ""}
            onChange={(event) => update("validationHint", event.target.value)}
            placeholder={t("validationPlaceholder")}
          />
        </label>
      </div>
    </details>
  );
}
