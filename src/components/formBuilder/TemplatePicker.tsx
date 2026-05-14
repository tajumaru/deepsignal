import { useI18n } from "../../i18n";
import type { FormTemplateDefinition } from "../../lib/formTemplates";

interface TemplatePickerProps {
  templates: FormTemplateDefinition[];
  selectedTemplateKey: string;
  onSelect: (templateKey: string) => void;
}

export function TemplatePicker({ templates, selectedTemplateKey, onSelect }: TemplatePickerProps) {
  const { t } = useI18n();

  function getTemplateLabel(template: FormTemplateDefinition) {
    switch (template.key) {
      case "bug":
        return t("templateBugLabel");
      case "feature":
        return t("templateFeatureLabel");
      case "feedback":
        return t("templateFeedbackLabel");
      case "survey":
        return t("templateSurveyLabel");
      case "playtest":
        return t("templatePlaytestLabel");
      case "beta":
        return t("templateBetaLabel");
      case "custom":
        return t("templateCustomLabel");
      case "blank":
        return t("templateBlankLabel");
      default:
        return template.label;
    }
  }

  function getTemplateDescription(template: FormTemplateDefinition) {
    switch (template.key) {
      case "bug":
        return t("templateBugDescription");
      case "feature":
        return t("templateFeatureDescription");
      case "feedback":
        return t("templateFeedbackDescription");
      case "survey":
        return t("templateSurveyDescription");
      case "playtest":
        return t("templatePlaytestDescription");
      case "beta":
        return t("templateBetaDescription");
      case "custom":
        return t("templateCustomDescription");
      case "blank":
        return t("templateBlankDescription");
      default:
        return template.description;
    }
  }

  return (
    <div className="composer-template-grid">
      {templates.map((template) => {
        const active = selectedTemplateKey === template.key;
        return (
          <button
            key={template.key}
            type="button"
            className={`composer-template-card ${active ? "is-active" : ""}`}
            onClick={() => onSelect(template.key)}
          >
            <span className="composer-template-emoji" aria-hidden="true">
              {template.emoji}
            </span>
            <strong>{getTemplateLabel(template)}</strong>
            <span className="muted">{getTemplateDescription(template)}</span>
            <small className="composer-template-meta">
              {template.fields.length === 0 ? t("templateBlankCanvas") : t("templateStarterFields", { count: template.fields.length })}
            </small>
          </button>
        );
      })}
    </div>
  );
}
