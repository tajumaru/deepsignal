import { useI18n } from "../../i18n";
import type { FormField } from "../../types";

interface AdvancedSettingsProps {
  field: FormField;
  fields: FormField[];
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
        <section className="composer-advanced-group">
          <strong>{t("responseSettings")}</strong>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(event) => update("required", event.target.checked)}
              />
              <span>{t("required")}</span>
            </label>
          </div>

          <label>
            <span>{t("placeholder")}</span>
            <input
              value={field.placeholder ?? ""}
              onChange={(event) => update("placeholder", event.target.value)}
              placeholder={t("placeholderExample")}
            />
          </label>

          <label>
            <span>{t("helpText")}</span>
            <input
              value={field.helpText ?? ""}
              onChange={(event) => update("helpText", event.target.value)}
              placeholder={t("helpTextExample")}
            />
          </label>

          <label>
            <span>{t("validation")}</span>
            <input
              value={field.validationHint ?? ""}
              onChange={(event) => update("validationHint", event.target.value)}
              placeholder={t("validationPlaceholder")}
            />
          </label>
        </section>

        <section className="composer-advanced-group">
          <strong>{t("privacySettings")}</strong>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={field.sensitive}
                onChange={(event) => update("sensitive", event.target.checked)}
              />
              <span>{t("sensitive")}</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={Boolean(field.adminOnly)}
                onChange={(event) => update("adminOnly", event.target.checked)}
              />
              <span>{t("adminOnly")}</span>
            </label>
          </div>

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
        </section>
      </div>
    </details>
  );
}
