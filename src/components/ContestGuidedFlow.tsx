export interface ContestGuidedFlowStep {
  label: string;
  hint?: string;
  status: "complete" | "current" | "upcoming";
}

interface ContestGuidedFlowProps {
  steps: ContestGuidedFlowStep[];
  summary?: string;
  title?: string;
}

export function ContestGuidedFlow({
  steps,
  summary,
  title = "Contest Guided Flow",
}: ContestGuidedFlowProps) {
  return (
    <section className="panel contest-flow-card">
      <div className="section-row contest-flow-header">
        <div>
          <p className="eyebrow">Contest Guided Flow</p>
          <h2>{title}</h2>
        </div>
        {summary ? <p className="muted contest-flow-summary">{summary}</p> : null}
      </div>
      <div className="contest-flow-steps" role="list" aria-label={title}>
        {steps.map((step, index) => (
          <article
            key={step.label}
            className={`contest-flow-step is-${step.status}`}
            role="listitem"
            aria-current={step.status === "current" ? "step" : undefined}
          >
            <span className="contest-flow-step-index">{index + 1}</span>
            <div className="contest-flow-step-copy">
              <strong>{step.label}</strong>
              {step.hint ? <p>{step.hint}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
