import { createPortal } from "react-dom";
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
  onClose?: () => void;
  labels: {
    eyebrow: string;
    title: string;
    intro: string;
    terminalHeader: string;
    terminalActive: string;
    terminalFailed: string;
    statusComplete: string;
    statusInProgress: string;
    statusQueued: string;
    statusNeedsAttention: string;
    done: string;
    stages: Record<SignalPipelineStage, string>;
  };
}

export function SignalSubmissionPipeline({ pipeline, visible, onClose, labels }: SignalSubmissionPipelineProps) {
  if (!visible) {
    return null;
  }

  const activeIndex = SIGNAL_PIPELINE_STAGES.indexOf(pipeline.stage);
  const failed = pipeline.status === "failed";

  const dialog = (
    <div className="publish-overlay signal-submission-overlay" role="dialog" aria-modal="true" aria-labelledby="signal-submission-title">
      <div className="publish-overlay-backdrop" onClick={failed ? onClose : undefined} />
      <section className={`publish-overlay-panel signal-submission-overlay-panel ${failed ? "is-failed" : ""}`} aria-live="polite">
        <div className="publish-overlay-noise" aria-hidden="true" />
        <div className="publish-overlay-scanlines" aria-hidden="true" />
        <div className="publish-overlay-particles" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, index) => (
            <span key={index} className={`publish-particle publish-particle-${(index % 4) + 1}`} />
          ))}
        </div>
        <div className="signal-submission-overlay-hero">
          <div className="publish-overlay-copy">
            <p className="eyebrow">{labels.eyebrow}</p>
            <h2 id="signal-submission-title">{failed ? labels.statusNeedsAttention : labels.title}</h2>
            <p className="muted publish-overlay-intro">{labels.intro}</p>
          </div>
          <span className="signal-submission-pipeline-pill">
            {failed
              ? labels.statusNeedsAttention
              : pipeline.status === "complete"
                ? labels.statusComplete
                : labels.statusInProgress}
          </span>
        </div>
        <div className={`signal-submission-pipeline ${failed ? "is-failed" : ""}`}>
          <div className="signal-submission-pipeline-header">
            <span>{labels.terminalHeader}</span>
            <strong>{failed ? labels.terminalFailed : labels.terminalActive}</strong>
          </div>
          <div className="signal-submission-steps" role="list">
            {SIGNAL_PIPELINE_STAGES.map((stage, index) => {
              const isDone = pipeline.status === "complete" || index < activeIndex;
              const isActive = !failed && index === activeIndex;
              const isFailed = failed && index === activeIndex;
              const statusText = isDone
                ? labels.statusComplete
                : isActive
                  ? labels.statusInProgress
                  : isFailed
                    ? labels.statusNeedsAttention
                    : labels.statusQueued;
              return (
                <div
                  key={stage}
                  className={`signal-submission-step ${isDone ? "is-done" : ""} ${
                    isActive ? "is-active" : ""
                  } ${isFailed ? "is-failed" : ""}`}
                  role="listitem"
                >
                  <span className="signal-submission-step-dot" aria-hidden="true" />
                  <span>{labels.stages[stage] ?? PIPELINE_LABELS[stage]}</span>
                  <small>{statusText}</small>
                </div>
              );
            })}
          </div>
          {pipeline.message ? <p className="signal-submission-pipeline-message">{pipeline.message}</p> : null}
        </div>
        {failed && onClose ? (
          <div className="signal-submission-overlay-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              {labels.done}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}
