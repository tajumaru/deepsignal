import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildInfo } from "../lib/buildInfo";
import { useDashboardProjectRestoreSnapshot } from "../lib/dashboardProjectRestore";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle } from "../lib/routeDiagnostics";

export function DashboardShellFirstPanel({
  onRetryWalletRuntime,
  routePath,
  walletStatusMessage = "Wallet runtime loading...",
}: {
  onRetryWalletRuntime: () => void;
  routePath: string;
  walletStatusMessage?: string;
}) {
  const restoreSnapshot = useDashboardProjectRestoreSnapshot();
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const currentProjectId = restoreSnapshot.currentProjectId;
  const restorePending = restoreSnapshot.state === "unknown" || restoreSnapshot.state === "restoring";

  useEffect(() => {
    const eventName = restorePending
      ? "dashboard:empty-project-state-blocked"
      : currentProjectId
        ? "dashboard:shell-render"
        : "dashboard:empty-project-state-render";
    logRouteLifecycle(eventName, {
      routePath,
      currentProjectId: currentProjectId || "",
      walletRuntime: restoreSnapshot.walletRuntime,
      projectRestoreState: restoreSnapshot.state,
      projectRestoreSource: restoreSnapshot.source,
      buildVersion: buildInfo.appVersion,
    });
  }, [currentProjectId, restorePending, restoreSnapshot.source, restoreSnapshot.state, restoreSnapshot.walletRuntime, routePath]);

  async function handleCopyDiagnostics() {
    try {
      await navigator.clipboard.writeText(formatRouteLifecycleDiagnostics());
      setCopiedDiagnostics(true);
      window.setTimeout(() => setCopiedDiagnostics(false), 1800);
    } catch {
      setCopiedDiagnostics(false);
    }
  }

  return (
    <main className="dashboard-degraded-shell" role="main" aria-label="Signal Intelligence Workspace">
      <section className="panel glow-panel route-status-panel" role="status">
        <p className="eyebrow">Signal Intelligence Workspace</p>
        <h1>
          {restorePending ? "Restoring signal project" : currentProjectId ? "Dashboard shell ready" : "Choose or create a signal project"}
        </h1>
        <p className="muted">
          {restorePending
            ? "DeepSignal is keeping the dashboard shell interactive while wallet and project restore settle. Local fallback data is preserved."
            : "The dashboard shell is usable while protected wallet-only controls finish loading. Local fallback data is preserved."}
        </p>
        <dl className="route-status-metadata">
          <div>
            <dt>Version</dt>
            <dd>{buildInfo.label}</dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>{routePath}</dd>
          </div>
          <div>
            <dt>currentProjectId</dt>
            <dd>{currentProjectId || "empty"}</dd>
          </div>
          <div>
            <dt>Project restore</dt>
            <dd>{restoreSnapshot.state}</dd>
          </div>
          <div>
            <dt>Wallet runtime</dt>
            <dd>{restorePending ? `${walletStatusMessage} (${restoreSnapshot.walletRuntime})` : walletStatusMessage}</dd>
          </div>
        </dl>
        <div className="inline-actions">
          <Link className="primary-button" to="/create">
            Compose Signal
          </Link>
          <Link className="ghost-button" to="/explore">
            Explore Signals
          </Link>
          <button type="button" className="ghost-button" onClick={onRetryWalletRuntime}>
            Retry wallet runtime
          </button>
          <button type="button" className="ghost-button" onClick={() => void handleCopyDiagnostics()}>
            {copiedDiagnostics ? "Copied diagnostics" : "Copy diagnostics"}
          </button>
        </div>
      </section>
    </main>
  );
}
