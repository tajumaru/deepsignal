import { useMemo, useState } from "react";
import type { FieldType, IntentDraft, IntentDraftBlock } from "../types";

interface IntentStartStepProps {
  onApplyDraft: (draft: IntentDraft) => void;
}

const EXAMPLE_INTENTS = [
  "Private feedback",
  "Bug report with evidence",
  "Governance signal",
];

const INTENT_OPTIONS = ["Private feedback", "Bug report", "Feature request", "Governance signal"];
const SIGNAL_POLICIES = ["Anonymous allowed", "Sealed responses", "Attachments on", "Priority included"];
const LIFECYCLE_STEPS = ["Intent", "Opened", "Protected", "Stored", "Reviewed"];
const SIGNAL_POLICY_ICON_CLASSES: Record<string, string> = {
  "Anonymous allowed": "is-anonymous",
  "Sealed responses": "is-sealed",
  "Attachments on": "is-attachments",
  "Priority included": "is-priority",
};
const SIGNAL_POLICY_GROUP_LABELS: Record<string, string> = {
  "Anonymous allowed": "Identity policy",
  "Sealed responses": "Private signal",
  "Attachments on": "Evidence",
  "Priority included": "Review cue",
};

const FLOW_SECTIONS = [
  {
    title: "Introduction",
    description: "Frame the signal before asking for input.",
  },
  {
    title: "Context",
    description: "Collect the situation around the response.",
  },
  {
    title: "Experience",
    description: "Capture the core evidence and feeling.",
  },
  {
    title: "Reflection",
    description: "Let the responder shape the final meaning.",
  },
  {
    title: "Identity",
    description: "Keep attribution intentional and optional.",
  },
];

function toSignalTitle(intent: string) {
  const compactIntent = intent.trim().replace(/\s+/g, " ");
  if (!compactIntent) {
    return "Untitled Signal";
  }
  const withoutCollect = compactIntent.replace(/^(collect|capture|create|compose|understand)\s+/i, "");
  return withoutCollect.charAt(0).toUpperCase() + withoutCollect.slice(1);
}

function getIntentTone(intent: string) {
  const lowerIntent = intent.toLowerCase();
  if (lowerIntent.includes("bug") || lowerIntent.includes("frustration") || lowerIntent.includes("onboarding")) {
    return "friction";
  }
  if (lowerIntent.includes("anonymous") || lowerIntent.includes("sealed") || lowerIntent.includes("private")) {
    return "sealed";
  }
  if (lowerIntent.includes("hackathon") || lowerIntent.includes("event") || lowerIntent.includes("workshop")) {
    return "event";
  }
  return "reflection";
}

function createDraftBlocks(intent: string): IntentDraftBlock[] {
  const tone = getIntentTone(intent);
  const compactIntent = intent.trim() || "this signal";
  const blocks: IntentDraftBlock[] = [
    {
      type: "markdown",
      label: "Opening note",
      helpText: `Introduce why you are composing a signal about ${compactIntent}.`,
      placeholder: "Share a short note about why this signal matters.",
      sectionTitle: "Introduction",
    },
    {
      type: "shortText",
      label: "What should this signal help us understand?",
      helpText: "A concise starting point for the response.",
      placeholder: "One sentence is enough.",
      required: true,
      sectionTitle: "Context",
    },
    {
      type: "longText",
      label: tone === "friction" ? "Where did the experience feel blocked?" : "What happened from your point of view?",
      helpText: "Invite narrative detail without forcing a rigid answer.",
      placeholder: "Describe the moment, feeling, or observation...",
      required: true,
      sectionTitle: "Experience",
    },
    {
      type: "rating",
      label: tone === "event" ? "How valuable was this experience?" : "How strong is this signal?",
      helpText: "A lightweight intensity marker for triage.",
      required: true,
      sectionTitle: "Experience",
    },
    {
      type: "longText",
      label: "What would you change or preserve?",
      helpText: "Close with constructive reflection.",
      placeholder: "Suggest a next move, fix, or thing to keep...",
      sectionTitle: "Reflection",
    },
    {
      type: tone === "sealed" ? "confirmation" : "country_select",
      label: tone === "sealed" ? "I understand this is a sealed reflection" : "Optional identity context",
      helpText: tone === "sealed" ? "Make the privacy posture explicit before publishing." : "Keep identity lightweight and optional.",
      required: tone === "sealed",
      sectionTitle: "Identity",
    },
  ];

  if (tone === "friction") {
    blocks.splice(4, 0, {
      type: "screenshot",
      label: "Attach supporting evidence",
      helpText: "Screenshots or files can help reconstruct the signal.",
      sectionTitle: "Experience",
    });
  }

  return blocks;
}

function composeIntentDraft(intent: string): IntentDraft {
  const title = toSignalTitle(intent);
  return {
    title,
    description: intent.trim()
      ? `A signal flow composed to understand: ${intent.trim()}`
      : "A signal flow composed from intent, narrative blocks, and optional identity context.",
    sections: FLOW_SECTIONS,
    blocks: createDraftBlocks(intent),
  };
}

function getQuietSuggestions(intent: string, policies: string[]) {
  const lowerIntent = intent.toLowerCase();
  const suggestions = new Set<string>();

  if (!policies.includes("Anonymous allowed")) {
    suggestions.add("Recommend anonymous response path");
  }
  if (!policies.includes("Sealed responses")) {
    suggestions.add("Private by default would fit this signal");
  }
  if (lowerIntent.includes("bug") || lowerIntent.includes("evidence") || lowerIntent.includes("blocked")) {
    suggestions.add("Attachment intake may help review");
  }
  if (!policies.includes("Priority included")) {
    suggestions.add("Add priority classification for review");
  }
  if (lowerIntent.includes("governance") || lowerIntent.includes("roadmap") || lowerIntent.includes("feature")) {
    suggestions.add("Generate review categories");
  }
  if (suggestions.size === 0) {
    suggestions.add("Signal is ready for a protected review queue");
  }

  return [...suggestions].slice(0, 3);
}

function getBlockKind(type: FieldType) {
  const labels: Record<FieldType, string> = {
    shortText: "Question Block",
    longText: "Reflection Block",
    markdown: "Markdown Block",
    date: "Time Block",
    dropdown: "Choice Block",
    checkbox: "Multi Choice Block",
    matrix: "Matrix Block",
    country_select: "Identity Block",
    confirmation: "Consent Block",
    rating: "Signal Strength Block",
    url: "Reference Block",
    screenshot: "Attachment Block",
    video: "Media Block",
  };
  return labels[type] ?? "Signal Block";
}

export function IntentStartStep({ onApplyDraft }: IntentStartStepProps) {
  const [intent, setIntent] = useState("");
  const [activePolicies, setActivePolicies] = useState<string[]>(["Anonymous allowed", "Sealed responses", "Priority included"]);
  const [draft, setDraft] = useState<IntentDraft | null>(null);
  const canApply = Boolean(draft?.blocks.length);
  const composedIntent = [intent, ...activePolicies].filter(Boolean).join(" / ");
  const previewDraft = useMemo(() => draft ?? composeIntentDraft(composedIntent), [draft, composedIntent]);
  const quietSuggestions = useMemo(() => getQuietSuggestions(composedIntent, activePolicies), [activePolicies, composedIntent]);

  function handleGenerateDraft() {
    setDraft(composeIntentDraft(composedIntent));
  }

  function handleExampleIntent(example: string) {
    setIntent(example);
    setDraft(composeIntentDraft([example, ...activePolicies].join(" / ")));
  }

  return (
    <section className="panel glow-panel composer-hero-card intent-start-card">
      <div className="intent-start-grid">
        <div className="intent-prompt-panel">
          <p className="eyebrow">Intent to Signal</p>
          <h2>Open a signal channel</h2>

          <label className="intent-textarea-wrap">
            <span>What do you want to collect?</span>
            <textarea
              className="intent-textarea"
              value={intent}
              onChange={(event) => {
                setIntent(event.target.value);
                setDraft(null);
              }}
              placeholder="Private feedback from early users..."
              rows={5}
            />
          </label>

          <div className="intent-option-grid" aria-label="Signal intent options">
            {INTENT_OPTIONS.map((option) => (
              <button key={option} type="button" className={intent === option ? "is-active" : ""} onClick={() => handleExampleIntent(option)}>
                {option}
              </button>
            ))}
          </div>

          <div className="intent-policy-grid" aria-label="Signal policy options">
            {SIGNAL_POLICIES.map((policy) => {
              const active = activePolicies.includes(policy);
              return (
                <div key={policy} className="intent-policy-group">
                  <span className="intent-policy-group-label">{SIGNAL_POLICY_GROUP_LABELS[policy]}</span>
                  <button
                    type="button"
                    className={active ? "is-active" : ""}
                    aria-pressed={active}
                    onClick={() => {
                      setActivePolicies((current) =>
                        current.includes(policy) ? current.filter((item) => item !== policy) : [...current, policy],
                      );
                      setDraft(null);
                    }}
                  >
                    <span
                      className={`intent-policy-icon ${SIGNAL_POLICY_ICON_CLASSES[policy]}`}
                      aria-hidden="true"
                    />
                    <span className="intent-policy-state" aria-hidden="true">{active ? "On" : "Off"}</span>
                    {policy}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="intent-example-grid" aria-label="Intent examples">
            {EXAMPLE_INTENTS.map((example) => (
              <button key={example} type="button" className="intent-example-chip" onClick={() => handleExampleIntent(example)}>
                {example}
              </button>
            ))}
          </div>

          <div className="intent-assist-actions">
            <button type="button" className="primary-button intent-action-button" onClick={handleGenerateDraft}>
              Generate Signal
            </button>
            <button type="button" className="ghost-button intent-action-button" onClick={handleGenerateDraft}>
              Refresh
            </button>
          </div>
        </div>

        <aside className="intent-draft-panel" aria-label="AI draft assist preview">
          <div className="intent-draft-header">
            <div>
              <p className="eyebrow">Mirror Draft</p>
              <h3>{previewDraft.title}</h3>
              <p className="muted">{previewDraft.description}</p>
            </div>
            <span className="intent-ai-chip">Intent mapped</span>
          </div>

          <div className="intent-lifecycle-strip" aria-label="Signal lifecycle">
            {LIFECYCLE_STEPS.map((step, index) => (
              <span key={step} className={index < 3 ? "is-active" : ""}>
                <i aria-hidden="true" />
                {step}
              </span>
            ))}
          </div>

          <div className="intent-suggestion-rail" aria-label="Suggested signal refinements">
            {quietSuggestions.map((suggestion) => (
              <span key={suggestion}>{suggestion}</span>
            ))}
          </div>

          <div className="intent-draft-flow">
            {previewDraft.blocks.map((block, index) => (
              <article key={`${block.type}-${block.label}-${index}`} className="intent-draft-block">
                <span className="intent-draft-index">B{index + 1}</span>
                <div>
                  <strong>{block.label}</strong>
                  <span>{getBlockKind(block.type)}</span>
                </div>
                {block.required ? <small>Required</small> : <small>Optional</small>}
              </article>
            ))}
          </div>

          <div className="intent-draft-apply-bar">
            <div>
              <strong>Channel preview</strong>
              <span>Protected signal {"->"} Stored safely {"->"} Review OS</span>
            </div>
            <button
              type="button"
              className="primary-button intent-action-button"
              disabled={!canApply}
              onClick={() => draft && onApplyDraft(draft)}
            >
              Apply Signal
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
