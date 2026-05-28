import { useState } from "react";
import { Link } from "react-router-dom";
import { resetLocalEnvironment } from "../../../lib/resetEnvironment";

export function InboxListSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`inbox-list-skeleton ${compact ? "is-compact" : ""}`} role="status" aria-live="polite">
      <span />
      <span />
      <span />
    </div>
  );
}

export function WorkspaceInsightsFallback() {
  return (
    <section className="panel workspace-insights-panel workspace-insights-loading" role="status" aria-live="polite">
      <div className="workspace-insights-header">
        <div>
          <p className="eyebrow">Signal intelligence</p>
          <h2>Preparing insights</h2>
        </div>
      </div>
      <InboxListSkeleton />
    </section>
  );
}

export function InboxRecoveryPanel({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry: () => void;
}) {
  const [resettingState, setResettingState] = useState(false);

  async function handleResetLocalState() {
    setResettingState(true);
    try {
      await resetLocalEnvironment();
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <section className="panel inbox-loading-panel" role="alert" aria-live="assertive">
      <div className="inbox-loading-copy">
        <p className="eyebrow">Encrypted Signal Inbox</p>
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        <p className="muted">
          Local fallback data, registry restore, or a partial publish state may be blocking recovery. You can retry or
          reset browser-local DeepSignal state without deleting on-chain records.
        </p>
      </div>
      <div className="inline-actions">
        <button type="button" className="primary-button" onClick={onRetry}>
          Retry workspace
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void handleResetLocalState()}
          disabled={resettingState}
        >
          {resettingState ? "Resetting local state..." : "Reset local state"}
        </button>
        <Link className="ghost-button" to="/">
          Open home
        </Link>
      </div>
    </section>
  );
}
