import { useI18n } from "../../i18n";
import type { FormSection } from "../../types";

interface SectionEditorProps {
  sections: FormSection[];
  onAddSection: (preset?: string) => void;
  onUpdateSection: (sectionId: string, patch: Partial<FormSection>) => void;
  onRemoveSection: (sectionId: string) => void;
}

const sectionPresets = ["Reproduction", "Environment", "Media", "Contact"];

export function SectionEditor({
  sections,
  onAddSection,
  onUpdateSection,
  onRemoveSection,
}: SectionEditorProps) {
  const { t } = useI18n();

  return (
    <section className="panel composer-section-editor">
      <div className="section-row composer-section-editor-header">
        <div>
          <p className="eyebrow">Sections</p>
          <h3>{t("sectionBuilderTitle")}</h3>
          <p className="muted">{t("sectionBuilderBody")}</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => onAddSection()}>
          + {t("addSection")}
        </button>
      </div>

      <div className="composer-section-preset-row">
        {sectionPresets.map((preset) => (
          <button key={preset} type="button" className="ghost-button" onClick={() => onAddSection(preset)}>
            + {preset}
          </button>
        ))}
      </div>

      {sections.length === 0 ? (
        <p className="muted">{t("sectionEmptyState")}</p>
      ) : (
        <div className="stack">
          {sections.map((section) => (
            <div key={section.id} className="composer-section-item">
              <label>
                <span>{t("sectionTitle")}</span>
                <input
                  value={section.title}
                  onChange={(event) => onUpdateSection(section.id, { title: event.target.value })}
                />
              </label>
              <label>
                <span>{t("description")}</span>
                <input
                  value={section.description ?? ""}
                  onChange={(event) => onUpdateSection(section.id, { description: event.target.value })}
                  placeholder={t("sectionDescriptionPlaceholder")}
                />
              </label>
              <button type="button" className="danger-button" onClick={() => onRemoveSection(section.id)}>
                {t("remove")}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
