import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../../i18n";
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
  const { t } = useI18n();

  return (
    <section className="panel workspace-insights-panel workspace-insights-loading" role="status" aria-live="polite">
      <div className="workspace-insights-header">
        <div>
          <p className="eyebrow">{t("workspaceInsightsFallbackEyebrow")}</p>
          <h2>{t("workspaceInsightsFallbackTitle")}</h2>
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
  const { t } = useI18n();

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
        <p className="eyebrow">{t("encryptedSignalInboxLabel")}</p>
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        <p className="muted">
          {t("inboxRecoveryPanelBody")}
        </p>
      </div>
      <div className="inline-actions">
        <button type="button" className="primary-button" onClick={onRetry}>
          {t("retryWorkspace")}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void handleResetLocalState()}
          disabled={resettingState}
        >
          {resettingState ? t("resettingLocalState") : t("resetLocalState")}
        </button>
        <Link className="ghost-button" to="/">
          {t("openHome")}
        </Link>
      </div>
    </section>
  );
}
