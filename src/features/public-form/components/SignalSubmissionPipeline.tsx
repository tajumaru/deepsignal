import { createPortal } from "react-dom";
import { PipelineStageIcon } from "../../../components/SignalFlowIcons";
import {
  SIGNAL_PIPELINE_STAGES,
  type SignalPipelineState,
  type SignalPipelineStage,
} from "../hooks/usePublicSubmission";

const PIPELINE_LABELS: Record<SignalPipelineStage, string> = {
  idle: "Ready",
  preparing: "Preparing",
  local_preserved: "Local preserved",
  walrus_uploading: "Walrus upload",
  inbox_syncing: "Inbox sync",
  completed: "Signal sent",
};

const RELAY_NODE_LABELS: Record<SignalPipelineStage, string> = {
  idle: "Hold",
  preparing: "Device",
  local_preserved: "Local",
  walrus_uploading: "Walrus",
  inbox_syncing: "Inbox",
  completed: "Sent",
};

const RELAY_WAITING_MESSAGES: Record<SignalPipelineStage, string> = {
  idle: "Hold to send this signal.",
  preparing: "Preparing your signal...",
  local_preserved: "Local recovery copy is preserved on this device.",
  walrus_uploading: "Uploading signal evidence to Walrus...",
  inbox_syncing: "Syncing the owner inbox index...",
  completed: "Signal sent.",
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
  const pending = pipeline.status === "pending";
  const complete = pipeline.status === "complete";
  const activeStageLabel = labels.stages[pipeline.stage] ?? PIPELINE_LABELS[pipeline.stage];
  const transitTitle = failed || pending ? labels.statusNeedsAttention : complete ? "Signal Secured" : "Signal in Secure Transit";
  const transitMessage = failed
    ? pipeline.message || "Transmission paused. Review the route status and retry when ready."
    : pipeline.message || RELAY_WAITING_MESSAGES[pipeline.stage];

  const dialog = (
    <div className="publish-overlay signal-submission-overlay" role="dialog" aria-modal="true" aria-labelledby="signal-submission-title">
      <div className="publish-overlay-backdrop" onClick={failed ? onClose : undefined} />
      <section
        className={`publish-overlay-panel signal-submission-overlay-panel ${failed ? "is-failed" : ""} ${pending ? "is-pending" : ""}`}
        aria-live="polite"
      >
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
            <h2 id="signal-submission-title">{transitTitle}</h2>
            <p className="muted publish-overlay-intro">
              {failed
                ? "The relay path needs attention before the signal can finish transmission."
                : pending
                  ? "Your signal is safely stored. Inbox synchronization will retry automatically."
                : "Do not close this screen until transmission completes."}
            </p>
          </div>
          <div className="signal-submission-relay-status" aria-hidden="true">
            <span>Secure Relay</span>
            <strong>{activeStageLabel}</strong>
          </div>
        </div>
        <div className={`signal-submission-pipeline ${failed ? "is-failed" : ""} ${pending ? "is-pending" : ""} ${complete ? "is-complete" : ""}`}>
          <div className="signal-submission-pipeline-header">
            <span>Relay Path</span>
            <strong>{failed || pending ? labels.terminalFailed : complete ? labels.statusComplete : labels.terminalActive}</strong>
          </div>
          <div className="signal-submission-steps" role="list">
            {SIGNAL_PIPELINE_STAGES.map((stage, index) => {
              const isDone = pipeline.status === "complete" || index < activeIndex;
              const isActive = !failed && index === activeIndex;
              const isFailed = failed && index === activeIndex;
              const isPending = pending && index === activeIndex;
              const statusText = isDone
                ? labels.statusComplete
                : isActive
                  ? isPending
                    ? labels.statusNeedsAttention
                    : labels.statusInProgress
                  : isFailed
                    ? labels.statusNeedsAttention
                    : labels.statusQueued;
              return (
                <div
                  key={stage}
                  className={`signal-submission-step ${isDone ? "is-done" : ""} ${
                    isActive ? "is-active" : ""
                  } ${isFailed ? "is-failed" : ""} ${isPending ? "is-pending" : ""}`}
                  role="listitem"
                >
                  {index > 0 ? (
                    <span
                      className={`signal-submission-edge ${isDone ? "is-done" : ""} ${
                        isActive || isFailed ? "is-current" : ""
                      }`}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="signal-submission-step-icon" aria-hidden="true">
                    <PipelineStageIcon stage={stage} />
                  </span>
                  <span className="signal-submission-node-label">{RELAY_NODE_LABELS[stage]}</span>
                  <span>{labels.stages[stage] ?? PIPELINE_LABELS[stage]}</span>
                  <small>{statusText}</small>
                </div>
              );
            })}
          </div>
          <p className="signal-submission-pipeline-message">{transitMessage}</p>
        </div>
        {(failed || pending) && onClose ? (
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
