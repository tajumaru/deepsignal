import type { FormTemplateDefinition } from "../../lib/formTemplates";

interface TemplatePickerProps {
  templates: FormTemplateDefinition[];
  selectedTemplateKey: string;
  onSelect: (templateKey: string) => void;
}

export function TemplatePicker({ templates, selectedTemplateKey, onSelect }: TemplatePickerProps) {
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
            <strong>{template.label}</strong>
            <span className="muted">{template.description}</span>
            <small className="composer-template-meta">
              {template.fields.length === 0 ? "Blank canvas" : `${template.fields.length} starter fields`}
            </small>
          </button>
        );
      })}
    </div>
  );
}
