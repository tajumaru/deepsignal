import { useEffect, useMemo, useState } from "react";
import { buildInfo } from "../lib/buildInfo";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle } from "../lib/routeDiagnostics";
import { LocalRecoveryCenter } from "./LocalRecoveryCenter";

type DashboardFailedImport = {
  at?: number;
  label?: string;
  message?: string;
  chunkUrl?: string | null;
  attempt?: number;
  category?: string;
  probe?: {
    status?: number;
    contentType?: string;
    contentLength?: string;
    bodyLooksLikeHtml?: boolean;
    bodyEmpty?: boolean;
    ok?: boolean;
  };
  dependencyProbe?: {
    totalCount?: number;
    failedCount?: number;
  };
};

function readLatestDashboardImportFailure(): DashboardFailedImport | null {
  if (typeof window === "undefined") {
    return null;
  }
  const failedImports = window.__DEEPSIGNAL_DEBUG__?.failedImports ?? [];
  for (let index = failedImports.length - 1; index >= 0; index -= 1) {
    const entry = failedImports[index];
    if (entry.label === "route-admin-dashboard") {
      return entry;
    }
  }
  return null;
}

export function DashboardRecoveryPanel({
  error,
  onRetry,
  routePath,
}: {
  error: unknown;
  onRetry: () => void;
  routePath: string;
}) {
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const latestFailure = useMemo(() => readLatestDashboardImportFailure(), []);
  const errorName = error instanceof Error ? error.name : "Error";
  const errorMessage = error instanceof Error ? error.message : String(error ?? "Unknown dashboard route failure");
  const probe = latestFailure?.probe;
  const dependencyProbe = latestFailure?.dependencyProbe;

  useEffect(() => {
    logRouteLifecycle("dashboard:route-recovery-panel-render", {
      routePath,
      buildVersion: buildInfo.appVersion,
      errorName,
      errorMessage,
      failedImport: latestFailure,
    });
  }, [errorMessage, errorName, latestFailure, routePath]);

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
    <main className="dashboard-degraded-shell" role="main" aria-label="Dashboard route recovery">
      <section className="panel glow-panel route-status-panel" role="status">
        <p className="eyebrow">Signal Intelligence Workspace</p>
        <h1>Dashboard route recovery</h1>
        <p className="muted">
          The dashboard shell is still online, but the admin route chunk failed to execute on this device.
          Local fallback data is preserved.
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
            <dt>Failure</dt>
            <dd>{errorName}: {errorMessage}</dd>
          </div>
          <div>
            <dt>Chunk</dt>
            <dd>{latestFailure?.chunkUrl || "unknown"}</dd>
          </div>
          <div>
            <dt>Fetch probe</dt>
            <dd>
              {probe
                ? `${probe.status ?? "?"} ${probe.contentType ?? "unknown"} html=${String(
                    Boolean(probe.bodyLooksLikeHtml),
                  )} empty=${String(Boolean(probe.bodyEmpty))}`
                : "pending"}
            </dd>
          </div>
          <div>
            <dt>Dependencies</dt>
            <dd>
              {dependencyProbe
                ? `${dependencyProbe.failedCount ?? 0}/${dependencyProbe.totalCount ?? 0} failed`
                : "pending"}
            </dd>
          </div>
        </dl>
        <div className="inline-actions">
          <button type="button" className="primary-button" onClick={onRetry}>
            Retry dashboard chunk
          </button>
          <button type="button" className="ghost-button" onClick={() => void handleCopyDiagnostics()}>
            {copiedDiagnostics ? "Copied diagnostics" : "Copy diagnostics"}
          </button>
        </div>
        <LocalRecoveryCenter />
      </section>
    </main>
  );
}
