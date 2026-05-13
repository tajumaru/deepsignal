import type { FieldType } from "../../types";
import { useI18n } from "../../i18n";

type PickerFieldType = FieldType | "richText";

interface FieldTypePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (type: FieldType) => void;
}

const fieldTypeChoices: Array<{
  type: PickerFieldType;
  icon: string;
  title: string;
  description: string;
}> = [
  { type: "shortText", icon: "Aa", title: "Text", description: "Single-line answers, names, labels, and short summaries." },
  { type: "richText", icon: "¶", title: "Rich Text", description: "Long-form responses, bug details, and narrative feedback." },
  { type: "dropdown", icon: "▾", title: "Dropdown", description: "One choice from a compact option list." },
  { type: "checkbox", icon: "☑", title: "Checkbox", description: "Multiple selections for tags, surfaces, or used features." },
  { type: "rating", icon: "★", title: "Star Rating", description: "1-5 sentiment scoring with fast input." },
  { type: "url", icon: "↗", title: "URL", description: "Links to docs, builds, issues, or external proof." },
  { type: "screenshot", icon: "⌁", title: "Screenshot Upload", description: "Image evidence from desktop or mobile capture." },
  { type: "video", icon: "▶", title: "Video Upload", description: "Short clips showing flow, bugs, or reactions." },
];

function toFieldType(type: PickerFieldType): FieldType {
  return type === "richText" ? "longText" : type;
}

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
                onPick(toFieldType(choice.type));
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
