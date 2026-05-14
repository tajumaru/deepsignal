import {
  SIGNAL_PIPELINE_STAGES,
  type SignalPipelineState,
  type SignalPipelineStage,
} from "../hooks/usePublicSubmission";

const PIPELINE_LABELS: Record<SignalPipelineStage, string> = {
  preparing_signal: "Preparing signal",
  encrypting: "Encrypting",
  uploading_to_walrus: "Uploading to Walrus",
  confirming_blob: "Confirming blob",
  generating_manifest: "Generating manifest",
  signal_secured: "Signal secured",
};

interface SignalSubmissionPipelineProps {
  pipeline: SignalPipelineState;
  visible: boolean;
}

export function SignalSubmissionPipeline({ pipeline, visible }: SignalSubmissionPipelineProps) {
  if (!visible) {
    return null;
  }

  const activeIndex = SIGNAL_PIPELINE_STAGES.indexOf(pipeline.stage);
  const failed = pipeline.status === "failed";

  return (
    <section className={`answer-card signal-submission-pipeline ${failed ? "is-failed" : ""}`} aria-live="polite">
      <div className="signal-submission-pipeline-header">
        <div>
          <p className="eyebrow">Secure delivery</p>
          <h3>{failed ? "Signal paused" : PIPELINE_LABELS[pipeline.stage]}</h3>
        </div>
        <span className="signal-submission-pipeline-pill">
          {failed ? "Needs attention" : pipeline.status === "complete" ? "Secured" : "In progress"}
        </span>
      </div>
      <div className="signal-submission-steps" role="list">
        {SIGNAL_PIPELINE_STAGES.map((stage, index) => {
          const isDone = pipeline.status === "complete" || index < activeIndex;
          const isActive = !failed && index === activeIndex;
          const isFailed = failed && index === activeIndex;
          return (
            <div
              key={stage}
              className={`signal-submission-step ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""} ${
                isFailed ? "is-failed" : ""
              }`}
              role="listitem"
            >
              <span className="signal-submission-step-dot" aria-hidden="true" />
              <span>{PIPELINE_LABELS[stage]}</span>
            </div>
          );
        })}
      </div>
      {pipeline.message ? <p className="muted signal-submission-pipeline-message">{pipeline.message}</p> : null}
    </section>
  );
}
