import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import type { Translate } from "../features/createForm/types";

const quickCreateTemplates = [
  { id: "feedback", templateKey: "feedback", labelKey: "quickCreateFeedback", ideaKey: "quickCreateFeedbackIdea" },
  { id: "bug", templateKey: "bug", labelKey: "quickCreateBugReport", ideaKey: "quickCreateBugReportIdea" },
  { id: "feature", templateKey: "feature", labelKey: "quickCreateFeatureRequest", ideaKey: "quickCreateFeatureRequestIdea" },
  { id: "survey", templateKey: "survey", labelKey: "quickCreateEventSurvey", ideaKey: "quickCreateEventSurveyIdea" },
  {
    id: "anonymous_feedback",
    templateKey: "feedback",
    labelKey: "quickCreateAnonymousFeedback",
    ideaKey: "quickCreateAnonymousFeedbackIdea",
  },
];

interface QuickCreateFormProps {
  compact?: boolean;
}

export function QuickCreateForm({ compact = false }: QuickCreateFormProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [templateId, setTemplateId] = useState(quickCreateTemplates[0].id);
  const [templateKey, setTemplateKey] = useState(quickCreateTemplates[0].templateKey);
  const [activeIdeaKey, setActiveIdeaKey] = useState<string | null>(null);

  function openGuestDraft(nextIdea = idea, nextTemplateKey = templateKey) {
    const params = new URLSearchParams({
      mode: "guestDraft",
      template: nextTemplateKey,
      fresh: String(Date.now()),
    });
    const normalizedIdea = nextIdea.trim();
    if (normalizedIdea) {
      params.set("idea", normalizedIdea);
    }
    navigate(`/create?${params.toString()}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openGuestDraft();
  }

  return (
    <form className={`quick-create ${compact ? "quick-create-compact" : ""}`} onSubmit={handleSubmit}>
      <div className="quick-create-copy">
        <p className="eyebrow">{t("quickCreateEyebrow")}</p>
        <h2>{t("quickCreateTitle")}</h2>
        <p className="muted">{t("quickCreateBody")}</p>
      </div>

      <div className="quick-create-control">
        <input
          value={idea}
          onChange={(event) => {
            setIdea(event.target.value);
            setActiveIdeaKey(null);
          }}
          placeholder={t("quickCreatePlaceholder")}
          aria-label={t("quickCreateInputLabel")}
        />
        <button type="submit" className="primary-button">
          {t("quickCreateSubmit")}
        </button>
      </div>

      <div className="quick-create-chip-row" aria-label={t("quickCreateTemplatesLabel")}>
        {quickCreateTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`quick-create-chip ${
              templateId === template.id && activeIdeaKey === template.ideaKey ? "is-active" : ""
            }`}
            onClick={() => {
              const templateIdea = t(template.ideaKey as Parameters<Translate>[0]);
              setTemplateId(template.id);
              setTemplateKey(template.templateKey);
              setActiveIdeaKey(template.ideaKey);
              setIdea(templateIdea);
              openGuestDraft(templateIdea, template.templateKey);
            }}
          >
            {t(template.labelKey as Parameters<Translate>[0])}
          </button>
        ))}
      </div>
    </form>
  );
}
