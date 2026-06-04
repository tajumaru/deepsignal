import { useEffect, useMemo, useState } from "react";
import { DynamicField } from "../DynamicField";
import { FormHeaderImage } from "../FormHeaderImage";
import { RichTextContent } from "../RichText";
import { useI18n } from "../../i18n";
import { createEmptyAnswer } from "../../lib/storage";
import { getOrderedFields, getVisibleFieldIds, isFieldRequired } from "../../utils/formLogic";
import type { FormField, FormHeaderImage as FormHeaderImageConfig, FormHeaderLogo, FormSection } from "../../types";

interface LivePreviewProps {
  title: string;
  description: string;
  headerImage?: FormHeaderImageConfig | {
    url: string;
    alt: string;
    position: FormHeaderImageConfig["position"];
    source?: "url" | "upload";
    fileName?: string;
  };
  headerLogo?: FormHeaderLogo | {
    url: string;
    alt: string;
    source?: "url" | "upload";
    fileName?: string;
  };
  fields: FormField[];
  sections: FormSection[];
}

type PreviewAnswers = Record<string, unknown>;

export function LivePreview({
  title,
  description,
  headerImage,
  headerLogo,
  fields,
  sections,
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

  const visibleFieldIds = useMemo(() => getVisibleFieldIds(fields, answers), [answers, fields]);

  const sectionedFields = useMemo(() => {
    const orderedFields = getOrderedFields(fields);
    const orderedSections = sections.map((section) => ({
      ...section,
      fields: orderedFields.filter((field) => field.sectionId === section.id && visibleFieldIds.has(field.id)),
    }));
    const unsectionedFields = orderedFields.filter((field) => !field.sectionId && visibleFieldIds.has(field.id));
    return { orderedSections, unsectionedFields };
  }, [fields, sections, visibleFieldIds]);

  const questionNumbers = useMemo(() => {
    const visibleFields = getOrderedFields(fields).filter((field) => visibleFieldIds.has(field.id));
    return new Map(visibleFields.map((field, index) => [field.id, index + 1]));
  }, [fields, visibleFieldIds]);

  return (
    <section className="panel glow-panel composer-live-preview">
      <FormHeaderImage
        image={headerImage}
        logo={headerLogo}
        className="composer-preview-header-image"
        fallbackTitle={title || t("untitledForm")}
      />
      <div className="composer-live-preview-header">
        <div>
          <p className="eyebrow">{t("preview")}</p>
          <h2>{title.trim() || t("untitledForm")}</h2>
          <RichTextContent value={description} className="lede rich-text-content" fallback={t("publicDefaultBody")} />
        </div>
      </div>

      <div className="stack composer-preview-fields-stack">
        {sectionedFields.orderedSections.map((section) =>
          section.fields.length ? (
            <section key={section.id} className="composer-preview-section">
              <div className="composer-preview-section-copy">
                <h3>{section.title || t("untitledSection")}</h3>
                {section.description ? <p className="muted">{section.description}</p> : null}
              </div>
              <div className="stack composer-preview-fields-stack">
                {section.fields.map((field) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={answers[field.id]}
                    questionNumber={questionNumbers.get(field.id)}
                    required={isFieldRequired(field, fields, answers, true)}
                    onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}

        {sectionedFields.unsectionedFields.length ? (
          <section className="composer-preview-section">
            <div className="stack composer-preview-fields-stack">
              {sectionedFields.unsectionedFields.map((field) => (
                <DynamicField
                  key={field.id}
                  field={field}
                  value={answers[field.id]}
                  questionNumber={questionNumbers.get(field.id)}
                  required={isFieldRequired(field, fields, answers, true)}
                  onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
