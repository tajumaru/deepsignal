import { useEffect, useMemo, useState } from "react";
import { DynamicField } from "../DynamicField";
import { useI18n } from "../../i18n";
import { createEmptyAnswer } from "../../lib/storage";
import type { FormField, FormSection } from "../../types";

interface LivePreviewProps {
  title: string;
  description: string;
  fields: FormField[];
  sections: FormSection[];
  encryptSubmissions: boolean;
}

type PreviewAnswers = Record<string, unknown>;

export function LivePreview({
  title,
  description,
  fields,
  sections,
  encryptSubmissions,
}: LivePreviewProps) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<PreviewAnswers>({});

  useEffect(() => {
    setAnswers((current) => {
      const next: PreviewAnswers = {};
      fields.forEach((field) => {
        next[field.id] = field.id in current ? current[field.id] : createEmptyAnswer(field);
      });
      return next;
    });
  }, [fields]);

  const sectionedFields = useMemo(() => {
    const orderedSections = sections.map((section) => ({
      ...section,
      fields: fields.filter((field) => field.sectionId === section.id),
    }));
    const unsectionedFields = fields.filter((field) => !field.sectionId);
    return { orderedSections, unsectionedFields };
  }, [fields, sections]);

  return (
    <section className="panel glow-panel composer-live-preview">
      <div className="composer-live-preview-header">
        <div>
          <p className="eyebrow">{t("preview")}</p>
          <h2>{title.trim() || t("untitledForm")}</h2>
          <p className="lede">{description.trim() || t("publicDefaultBody")}</p>
        </div>
        <div className="info-banner composer-preview-banner">
          <strong>{t("encryptSubmissions")}</strong>
          <span>{encryptSubmissions ? t("enabled") : t("disabled")}</span>
        </div>
      </div>

      <div className="stack">
        {sectionedFields.orderedSections.map((section) =>
          section.fields.length ? (
            <section key={section.id} className="composer-preview-section">
              <div className="composer-preview-section-copy">
                <h3>{section.title || t("untitledSection")}</h3>
                {section.description ? <p className="muted">{section.description}</p> : null}
              </div>
              <div className="stack">
                {section.fields.map((field) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={answers[field.id]}
                    onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}

        {sectionedFields.unsectionedFields.map((field) => (
          <DynamicField
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
          />
        ))}
      </div>
    </section>
  );
}
