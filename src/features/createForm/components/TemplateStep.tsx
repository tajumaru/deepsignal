import { TemplatePicker } from "../../../components/formBuilder/TemplatePicker";
import { formTemplates } from "../../../lib/formTemplates";
import type { Translate } from "../types";

interface TemplateStepProps {
  t: Translate;
  selectedTemplateKey: string;
  onSelectTemplate: (templateKey: string) => void;
}

export function TemplateStep({ t, selectedTemplateKey, onSelectTemplate }: TemplateStepProps) {
  return (
    <section className="panel glow-panel composer-hero-card">
      <div className="composer-hero-copy">
        <p className="eyebrow">{t("templateEyebrow")}</p>
        <h2>{t("templateTitle")}</h2>
        <p className="muted">{t("templateCustomBody")}</p>
      </div>
      <TemplatePicker
        templates={formTemplates}
        selectedTemplateKey={selectedTemplateKey}
        onSelect={onSelectTemplate}
      />
    </section>
  );
}
