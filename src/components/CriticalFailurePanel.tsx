import { hasInconsistentPublishState, type CriticalFailure } from "../lib/criticalFailure";

export interface CriticalFailureAction {
  key: string;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

interface CriticalFailurePanelProps {
  failure: CriticalFailure;
  title: string;
  copyLabel: string;
  copiedLabel: string;
  guidance?: string;
  actions?: CriticalFailureAction[];
  copied?: boolean;
  onCopyDiagnostics: () => void | Promise<void>;
}

export function CriticalFailurePanel({
  failure,
  title,
  copyLabel,
  copiedLabel,
  guidance,
  actions = [],
  copied = false,
  onCopyDiagnostics,
}: CriticalFailurePanelProps) {
  return (
    <section className="answer-card critical-failure-panel" aria-live="polite">
      <div className="section-row">
        <div>
          <p className="eyebrow">Recovery</p>
          <h3>{title}</h3>
        </div>
        <span className="signal-chip signal-chip-warn">{failure.id}</span>
      </div>
      <p className="error-text">{failure.message}</p>
      {guidance ? <p className="muted">{guidance}</p> : null}
      {hasInconsistentPublishState(failure) ? (
        <div className="metadata-list">
          <div className="metadata-row">
            <span>publish state</span>
            <strong>incomplete</strong>
          </div>
          <div className="metadata-row">
            <span>upload</span>
            <strong>not confirmed</strong>
          </div>
          <div className="metadata-row">
            <span>registry</span>
            <strong>updated earlier than expected</strong>
          </div>
        </div>
      ) : null}
      {failure.uploadSucceeded && !failure.registryUpdated ? (
        <div className="metadata-list">
          <div className="metadata-row">
            <span>upload</span>
            <strong>succeeded</strong>
          </div>
          <div className="metadata-row">
            <span>registry</span>
            <strong>not updated</strong>
          </div>
          <div className="metadata-row">
            <span>discoverability</span>
            <strong>response or form may not be discoverable yet</strong>
          </div>
          <div className="metadata-row">
            <span>retry</span>
            <strong>continues from the failed registry step when possible</strong>
          </div>
        </div>
      ) : null}
      {failure.noDataSubmitted ? <p className="muted">No data was submitted before this failure.</p> : null}
      <div className="inline-actions">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={action.key === "discard" ? "ghost-button" : "primary-button"}
            onClick={() => void action.onClick()}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ))}
        <button type="button" className="ghost-button" onClick={() => void onCopyDiagnostics()}>
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </section>
  );
}
