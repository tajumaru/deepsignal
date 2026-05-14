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
  title: string;
  description: string;
}> = [
  { type: "shortText", icon: "Aa", title: "Short Text", description: "Single-line answers, names, labels, and short summaries." },
  { type: "longText", icon: "LT", title: "Long Text", description: "Plain textarea for longer narrative answers." },
  { type: "markdown", icon: "MD", title: "Rich Text / Markdown", description: "Markdown-friendly textarea for formatted detail, release notes, or detailed reports." },
  { type: "date", icon: "CAL", title: "Date", description: "Calendar-based input for event dates, deadlines, launches, or follow-up timing." },
  { type: "dropdown", icon: "v", title: "Dropdown", description: "One choice from a compact option list." },
  { type: "checkbox", icon: "[]", title: "Checkboxes", description: "Multiple selections for tags, surfaces, or used features." },
  { type: "country_select", icon: "JP", title: "Country Select", description: "Searchable country picker with flags, readable labels, and ISO storage." },
  { type: "confirmationCheckbox", icon: "OK", title: "Confirmation Checkbox", description: "Single agreement checkbox for confirmation, consent, or acknowledgement." },
  { type: "rating", icon: "*", title: "Star Rating", description: "1-5 sentiment scoring with fast input." },
  { type: "url", icon: "->", title: "URL", description: "Links to docs, builds, issues, or external proof." },
  { type: "screenshot", icon: "IMG", title: "Screenshot Upload", description: "Image evidence from desktop or mobile capture." },
  { type: "video", icon: "VID", title: "Video Upload", description: "Short clips showing flow, bugs, or reactions." },
];

export function FieldTypePicker({ open, onClose, onPick }: FieldTypePickerProps) {
  const { t } = useI18n();

  if (!open) {
    return null;
  }

  return (
    <div className="composer-modal" role="dialog" aria-modal="true" aria-labelledby="field-type-picker-title">
      <button type="button" className="composer-modal-backdrop" aria-label={t("close")} onClick={onClose} />
      <div className="panel composer-modal-panel">
        <div className="section-row">
          <div>
            <p className="eyebrow">Field Library</p>
            <h2 id="field-type-picker-title">Add a signal input</h2>
            <p className="muted">Pick the input that best captures the next part of the signal.</p>
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
                <strong>{choice.title}</strong>
                <span className="muted">{choice.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
