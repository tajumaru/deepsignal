import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildInfo } from "../lib/buildInfo";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle } from "../lib/routeDiagnostics";

const SELECTED_PROJECT_ID_KEY = "deepsignal.projectRegistry.selectedProjectId";

function readCurrentProjectId() {
  try {
    return window.localStorage.getItem(SELECTED_PROJECT_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

export function DashboardShellFirstPanel({
  onRetryWalletRuntime,
  routePath,
  walletStatusMessage = "Wallet runtime loading...",
}: {
  onRetryWalletRuntime: () => void;
  routePath: string;
  walletStatusMessage?: string;
}) {
  const [currentProjectId, setCurrentProjectId] = useState(() => readCurrentProjectId());
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  useEffect(() => {
    logRouteLifecycle(currentProjectId ? "dashboard:shell-render" : "dashboard:empty-project-state-render", {
      routePath,
      currentProjectId: currentProjectId || "",
      walletRuntime: "deferred",
      buildVersion: buildInfo.appVersion,
    });

    const refresh = () => setCurrentProjectId(readCurrentProjectId());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [currentProjectId, routePath]);

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
        <h1>{currentProjectId ? "Dashboard shell ready" : "Choose or create a signal project"}</h1>
        <p className="muted">
          The dashboard shell is usable while protected wallet-only controls finish loading. Local fallback data is preserved.
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
            <dt>Wallet runtime</dt>
            <dd>{walletStatusMessage}</dd>
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
