import { useEffect, useState } from "react";
import { buildInfo } from "../lib/buildInfo";
import { useDashboardProjectRestoreSnapshot } from "../lib/dashboardProjectRestore";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle } from "../lib/routeDiagnostics";

export function DashboardFallbackShell({
  onRetryImports,
  routePath,
}: {
  onRetryImports: () => void;
  routePath: string;
}) {
  const restoreSnapshot = useDashboardProjectRestoreSnapshot();
  const currentProjectId = restoreSnapshot.currentProjectId;
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  useEffect(() => {
    logRouteLifecycle("dashboard:fallback-shell-render", {
      routePath,
      currentProjectId: currentProjectId || "",
      projectRestoreState: restoreSnapshot.state,
      projectRestoreSource: restoreSnapshot.source,
      walletRuntime: restoreSnapshot.walletRuntime,
      buildVersion: buildInfo.appVersion,
    });
  }, [currentProjectId, restoreSnapshot.source, restoreSnapshot.state, restoreSnapshot.walletRuntime, routePath]);

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
    <main className="dashboard-degraded-shell" role="main" aria-label="Dashboard fallback shell">
      <section className="panel glow-panel route-status-panel" role="status">
        <p className="eyebrow">Signal Intelligence Workspace</p>
        <h1>Preparing dashboard shell...</h1>
        <p className="muted">
          DeepSignal is keeping this private workspace mounted while protected workspace modules finish loading. Local fallback data is preserved.
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
        </dl>
        <div className="inline-actions">
          <button type="button" className="primary-button" onClick={onRetryImports}>
            Retry dashboard shell
          </button>
          <button type="button" className="ghost-button" onClick={() => void handleCopyDiagnostics()}>
            {copiedDiagnostics ? "Copied diagnostics" : "Copy diagnostics"}
          </button>
        </div>
      </section>
    </main>
  );
}
