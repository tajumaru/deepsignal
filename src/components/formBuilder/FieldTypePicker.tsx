import { useI18n } from "../../i18n";
import type { FieldType } from "../../types";

interface FieldTypePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (type: FieldType) => void;
}

const fieldTypeChoices: Array<{
  type: FieldType;
  icon: string;
  descriptionKey:
    | "fieldTypeDescriptionShortText"
    | "fieldTypeDescriptionLongText"
    | "fieldTypeDescriptionMarkdown"
    | "fieldTypeDescriptionDate"
    | "fieldTypeDescriptionDropdown"
    | "fieldTypeDescriptionCheckbox"
    | "fieldTypeDescriptionCountrySelect"
    | "fieldTypeDescriptionConfirmation"
    | "fieldTypeDescriptionRating"
    | "fieldTypeDescriptionUrl"
    | "fieldTypeDescriptionScreenshot"
    | "fieldTypeDescriptionVideo";
}> = [
  { type: "shortText", icon: "Aa", descriptionKey: "fieldTypeDescriptionShortText" },
  { type: "longText", icon: "LT", descriptionKey: "fieldTypeDescriptionLongText" },
  { type: "markdown", icon: "MD", descriptionKey: "fieldTypeDescriptionMarkdown" },
  { type: "date", icon: "CAL", descriptionKey: "fieldTypeDescriptionDate" },
  { type: "dropdown", icon: "v", descriptionKey: "fieldTypeDescriptionDropdown" },
  { type: "checkbox", icon: "[]", descriptionKey: "fieldTypeDescriptionCheckbox" },
  { type: "country_select", icon: "JP", descriptionKey: "fieldTypeDescriptionCountrySelect" },
  { type: "confirmation", icon: "OK", descriptionKey: "fieldTypeDescriptionConfirmation" },
  { type: "rating", icon: "*", descriptionKey: "fieldTypeDescriptionRating" },
  { type: "url", icon: "->", descriptionKey: "fieldTypeDescriptionUrl" },
  { type: "screenshot", icon: "IMG", descriptionKey: "fieldTypeDescriptionScreenshot" },
  { type: "video", icon: "VID", descriptionKey: "fieldTypeDescriptionVideo" },
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

        <div className="composer-field-type-grid">
          {fieldTypeChoices.map((choice) => (
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
      </div>
    </div>
  );
}
