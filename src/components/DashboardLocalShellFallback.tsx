import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildInfo } from "../lib/buildInfo";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle } from "../lib/routeDiagnostics";
import { localStorageAdapter } from "../storage/localStorageAdapter";

type DashboardLocalCounts = {
  formsCount: number | null;
  submissionsCount: number | null;
};

async function loadLocalCounts(): Promise<DashboardLocalCounts> {
  const forms = await localStorageAdapter.listForms();
  const submissionGroups = await Promise.all(forms.map((form) => localStorageAdapter.listSubmissions(form.id)));
  return {
    formsCount: forms.length,
    submissionsCount: submissionGroups.reduce((total, items) => total + items.length, 0),
  };
}

export function DashboardLocalShellFallback({
  error,
  onRetry,
  routePath,
  title = "Advanced dashboard failed to load.",
}: {
  error?: unknown;
  onRetry: () => void;
  routePath: string;
  title?: string;
}) {
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [counts, setCounts] = useState<DashboardLocalCounts>({
    formsCount: null,
    submissionsCount: null,
  });

  useEffect(() => {
    let cancelled = false;
    void loadLocalCounts()
      .then((nextCounts) => {
        if (!cancelled) {
          setCounts(nextCounts);
        }
      })
      .catch((countsError) => {
        logRouteLifecycle("dashboard:local-shell-counts-failed", {
          routePath,
          errorMessage: countsError instanceof Error ? countsError.message : String(countsError),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [routePath]);

  useEffect(() => {
    logRouteLifecycle("dashboard:local-shell-fallback-render", {
      routePath,
      buildVersion: buildInfo.appVersion,
      errorName: error instanceof Error ? error.name : undefined,
      errorMessage: error instanceof Error ? error.message : error ? String(error) : undefined,
      formsCount: counts.formsCount,
      submissionsCount: counts.submissionsCount,
    });
  }, [counts.formsCount, counts.submissionsCount, error, routePath]);

  async function handleCopyDiagnostics() {
    try {
      await navigator.clipboard.writeText(formatRouteLifecycleDiagnostics());
      setCopiedDiagnostics(true);
      window.setTimeout(() => setCopiedDiagnostics(false), 1800);
    } catch {
      setCopiedDiagnostics(false);
    }
  }

  const errorMessage = error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <main className="dashboard-degraded-shell" role="main" aria-label="Signal Intelligence Workspace">
      <section className="panel glow-panel route-status-panel" role="status">
        <p className="eyebrow">Signal Intelligence Workspace</p>
        <h1>{title}</h1>
        <p className="muted">
          DeepSignal kept the local dashboard shell online while the advanced workspace module failed to finish loading.
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
            <dt>Local forms</dt>
            <dd>{counts.formsCount ?? "loading"}</dd>
          </div>
          <div>
            <dt>Local submissions</dt>
            <dd>{counts.submissionsCount ?? "loading"}</dd>
          </div>
          {errorMessage ? (
            <div>
              <dt>Failure</dt>
              <dd>{errorMessage}</dd>
            </div>
          ) : null}
        </dl>
        <div className="inline-actions">
          <button type="button" className="primary-button" onClick={onRetry}>
            Retry
          </button>
          <Link className="ghost-button" to="/create">
            Compose Signal
          </Link>
          <Link className="ghost-button" to="/explore">
            Explore Signals
          </Link>
          <button type="button" className="ghost-button" onClick={() => void handleCopyDiagnostics()}>
            {copiedDiagnostics ? "Copied diagnostics" : "Copy diagnostics"}
          </button>
        </div>
      </section>
    </main>
  );
}
