import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

const quickCreateTemplates = [
  { key: "feedback", label: "Feedback", idea: "Product feedback" },
  { key: "bug", label: "Bug Report", idea: "Bug report" },
  { key: "feature", label: "Feature Request", idea: "Feature request" },
  { key: "survey", label: "Event Survey", idea: "Hackathon survey" },
  { key: "feedback", label: "Anonymous Feedback", idea: "Anonymous community feedback" },
];

interface QuickCreateFormProps {
  compact?: boolean;
}

export function QuickCreateForm({ compact = false }: QuickCreateFormProps) {
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [templateKey, setTemplateKey] = useState(quickCreateTemplates[0].key);

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
        <p className="eyebrow">Quick Create</p>
        <h2>Start a form before the admin work starts.</h2>
        <p className="muted">Draft freely now. Wallet, project, Walrus, and Seal checks happen at publish.</p>
      </div>

      <div className="quick-create-control">
        <input
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          placeholder="Product feedback, bug report, hackathon survey..."
          aria-label="Describe the form you want to create"
        />
        <button type="submit" className="primary-button">
          Create draft
        </button>
      </div>

      <div className="quick-create-chip-row" aria-label="Quick create templates">
        {quickCreateTemplates.map((template) => (
          <button
            key={`${template.key}-${template.label}`}
            type="button"
            className={`quick-create-chip ${templateKey === template.key && idea === template.idea ? "is-active" : ""}`}
            onClick={() => {
              setTemplateKey(template.key);
              setIdea(template.idea);
              openGuestDraft(template.idea, template.key);
            }}
          >
            {template.label}
          </button>
        ))}
      </div>
    </form>
  );
}
