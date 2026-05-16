import { useMemo, useState } from "react";
import type { FieldType, IntentDraft, IntentDraftBlock } from "../types";

interface IntentStartStepProps {
  onApplyDraft: (draft: IntentDraft) => void;
}

const EXAMPLE_INTENTS = [
  "Collect anonymous hackathon feedback",
  "Capture user frustrations during onboarding",
  "Create a sealed reflection flow",
];

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
  const [draft, setDraft] = useState<IntentDraft | null>(null);
  const canApply = Boolean(draft?.blocks.length);
  const previewDraft = useMemo(() => draft ?? composeIntentDraft(intent), [draft, intent]);

  function handleGenerateDraft() {
    setDraft(composeIntentDraft(intent));
  }

  function handleExampleIntent(example: string) {
    setIntent(example);
    setDraft(composeIntentDraft(example));
  }

  return (
    <section className="panel glow-panel composer-hero-card intent-start-card">
      <div className="intent-start-grid">
        <div className="intent-prompt-panel">
          <p className="eyebrow">Signal Intent</p>
          <h2>What are you trying to capture?</h2>
          <p className="muted">
            Describe the signal you want to compose. Mirror Mode will suggest a narrative flow, but nothing is applied
            until you approve the draft.
          </p>

          <label className="intent-textarea-wrap">
            <span>Describe the signal</span>
            <textarea
              className="intent-textarea"
              value={intent}
              onChange={(event) => {
                setIntent(event.target.value);
                setDraft(null);
              }}
              placeholder="Capture user frustrations during onboarding..."
              rows={7}
            />
          </label>

          <div className="intent-example-grid" aria-label="Intent examples">
            {EXAMPLE_INTENTS.map((example) => (
              <button key={example} type="button" className="intent-example-chip" onClick={() => handleExampleIntent(example)}>
                {example}
              </button>
            ))}
          </div>

          <div className="intent-assist-actions">
            <button type="button" className="button primary" onClick={handleGenerateDraft}>
              Generate Signal Flow
            </button>
            <button type="button" className="button ghost" onClick={handleGenerateDraft}>
              Suggest Blocks
            </button>
          </div>
        </div>

        <aside className="intent-draft-panel" aria-label="AI draft assist preview">
          <div className="intent-draft-header">
            <div>
              <p className="eyebrow">AI Draft Assist</p>
              <h3>{previewDraft.title}</h3>
              <p className="muted">{previewDraft.description}</p>
            </div>
            <span className="intent-ai-chip">Local mock</span>
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
              <strong>Preview only</strong>
              <span>No form state changes until Apply Draft.</span>
            </div>
            <button type="button" className="button primary" disabled={!canApply} onClick={() => draft && onApplyDraft(draft)}>
              Apply Draft
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
