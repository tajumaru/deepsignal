import { useI18n } from "../../i18n";
import type { FieldType } from "../../types";

interface FieldTypePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (type: FieldType) => void;
}

type FieldTypeDescriptionKey =
  | "fieldTypeDescriptionShortText"
  | "fieldTypeDescriptionLongText"
  | "fieldTypeDescriptionMarkdown"
  | "fieldTypeDescriptionDate"
  | "fieldTypeDescriptionDropdown"
  | "fieldTypeDescriptionCheckbox"
  | "fieldTypeDescriptionMatrix"
  | "fieldTypeDescriptionCountrySelect"
  | "fieldTypeDescriptionConfirmation"
  | "fieldTypeDescriptionRating"
  | "fieldTypeDescriptionUrl"
  | "fieldTypeDescriptionScreenshot"
  | "fieldTypeDescriptionVideo";

interface FieldTypeChoice {
  type: FieldType;
  icon: string;
  descriptionKey: FieldTypeDescriptionKey;
}

const fieldTypeCategories: Array<{
  title: string;
  choices: FieldTypeChoice[];
}> = [
  {
    title: "Text Input",
    choices: [
      { type: "shortText", icon: "Aa", descriptionKey: "fieldTypeDescriptionShortText" },
      { type: "longText", icon: "LT", descriptionKey: "fieldTypeDescriptionLongText" },
      { type: "markdown", icon: "MD", descriptionKey: "fieldTypeDescriptionMarkdown" },
    ],
  },
  {
    title: "Selection",
    choices: [
      { type: "dropdown", icon: "v", descriptionKey: "fieldTypeDescriptionDropdown" },
      { type: "checkbox", icon: "[]", descriptionKey: "fieldTypeDescriptionCheckbox" },
      { type: "matrix", icon: "GRID", descriptionKey: "fieldTypeDescriptionMatrix" },
      { type: "country_select", icon: "JP", descriptionKey: "fieldTypeDescriptionCountrySelect" },
      { type: "rating", icon: "*", descriptionKey: "fieldTypeDescriptionRating" },
    ],
  },
  {
    title: "Validation / Agreement",
    choices: [{ type: "confirmation", icon: "OK", descriptionKey: "fieldTypeDescriptionConfirmation" }],
  },
  {
    title: "Metadata",
    choices: [
      { type: "date", icon: "CAL", descriptionKey: "fieldTypeDescriptionDate" },
      { type: "url", icon: "->", descriptionKey: "fieldTypeDescriptionUrl" },
    ],
  },
  {
    title: "Media / Attachments",
    choices: [
      { type: "screenshot", icon: "IMG", descriptionKey: "fieldTypeDescriptionScreenshot" },
      { type: "video", icon: "VID", descriptionKey: "fieldTypeDescriptionVideo" },
    ],
  },
];

export function FieldTypePicker({ open, onClose, onPick }: FieldTypePickerProps) {
  const { t, fieldTypeLabel } = useI18n();

  if (!open) {
    return null;
  }

  return (
    <div className="composer-modal" role="dialog" aria-modal="true" aria-labelledby="field-type-picker-title">
      <button type="button" className="composer-modal-backdrop" aria-label={t("close")} onClick={onClose} />
      <div className="panel composer-modal-panel">
        <div className="section-row">
          <div>
            <p className="eyebrow">{t("blockLibraryTitle")}</p>
            <h2 id="field-type-picker-title">{t("fieldTypePickerTitle")}</h2>
            <p className="muted">{t("liveCanvasBody")}</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            {t("close")}
          </button>
        </div>

        <div className="composer-field-type-categories">
          {fieldTypeCategories.map((category) => {
            const headingId = `field-type-category-${category.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

            return (
              <section key={category.title} className="composer-field-type-category" aria-labelledby={headingId}>
                <h3 id={headingId} className="composer-field-type-category-heading">
                  {category.title}
                </h3>
                <div className="composer-field-type-grid">
                  {category.choices.map((choice) => (
                    <button
                      key={choice.type}
                      type="button"
                      className="composer-field-type-card"
                      onClick={() => {
                        onPick(choice.type);
                        onClose();
                      }}
                    >
                      <span className="composer-field-type-icon" aria-hidden="true">
                        {choice.icon}
                      </span>
                      <span className="composer-field-type-copy">
                        <strong>{fieldTypeLabel(choice.type)}</strong>
                        <span className="muted">{t(choice.descriptionKey)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
