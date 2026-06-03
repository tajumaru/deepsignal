import { useEffect, useMemo, useState } from "react";
import { buildInfo } from "../lib/buildInfo";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle } from "../lib/routeDiagnostics";
import { LocalRecoveryCenter } from "./LocalRecoveryCenter";

const SELECTED_PROJECT_ID_KEY = "deepsignal.projectRegistry.selectedProjectId";

function readCurrentProjectId() {
  try {
    return window.localStorage.getItem(SELECTED_PROJECT_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

function canClearAssetCache() {
  return typeof window !== "undefined" && "caches" in window;
}

async function clearDeepSignalAssetCaches() {
  if (!canClearAssetCache()) {
    return { removed: [] as string[], before: [] as string[], after: [] as string[] };
  }
  const before = await window.caches.keys();
  const targets = before.filter((name) => name.toLowerCase().includes("deepsignal"));
  await Promise.all(targets.map((name) => window.caches.delete(name)));
  const after = await window.caches.keys();
  return { removed: targets, before, after };
}

export function DashboardDegradedShell({
  onRetryImports,
  onContinueLiteMode,
  primaryActionLabel = "Retry imports",
  routePath,
  statusMessage = "DeepSignal is keeping the recovery surface available while workspace chunks finish loading. Local fallback data is preserved.",
  statusTitle = "Dashboard shell online",
}: {
  onContinueLiteMode?: () => void;
  onRetryImports: () => void;
  primaryActionLabel?: string;
  routePath: string;
  statusMessage?: string;
  statusTitle?: string;
}) {
  const [currentProjectId, setCurrentProjectId] = useState(() => readCurrentProjectId());
  const [cacheStatus, setCacheStatus] = useState("");
  const [clearingCache, setClearingCache] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const cacheAvailable = useMemo(() => canClearAssetCache(), []);

  useEffect(() => {
    logRouteLifecycle("dashboard:degraded-shell-render", {
      routePath,
      currentProjectId: currentProjectId || "",
      buildVersion: buildInfo.appVersion,
    });

    const refresh = () => setCurrentProjectId(readCurrentProjectId());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [currentProjectId, routePath]);

  async function handleClearAssetCache() {
    setClearingCache(true);
    setCacheStatus("");
    try {
      const result = await clearDeepSignalAssetCaches();
      setCacheStatus(
        result.removed.length > 0
          ? `Cleared ${result.removed.length} DeepSignal cache${result.removed.length === 1 ? "" : "s"}.`
          : "No DeepSignal asset cache entries were found.",
      );
      logRouteLifecycle("dashboard:degraded-shell-cache-cleared", {
        routePath,
        removedCaches: result.removed,
        cacheNamesBefore: result.before,
        cacheNamesAfter: result.after,
      });
    } catch (error) {
      setCacheStatus(error instanceof Error ? error.message : "Cache clear failed.");
      logRouteLifecycle("dashboard:degraded-shell-cache-clear-failed", {
        routePath,
        error,
      });
    } finally {
      setClearingCache(false);
    }
  }

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
    <main className="dashboard-degraded-shell" role="main" aria-label="Dashboard recovery shell">
      <section className="panel glow-panel route-status-panel" role="status">
        <p className="eyebrow">Signal Intelligence Workspace</p>
        <h1>{statusTitle}</h1>
        <p className="muted">{statusMessage}</p>
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
        </dl>
        <div className="inline-actions">
          <button type="button" className="primary-button" onClick={onRetryImports}>
            {primaryActionLabel}
          </button>
          {onContinueLiteMode ? (
            <button type="button" className="ghost-button" onClick={onContinueLiteMode}>
              Continue in Lite Mode
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={() => window.location.reload()}>
            Hard refresh
          </button>
          {cacheAvailable ? (
            <button type="button" className="ghost-button" onClick={() => void handleClearAssetCache()} disabled={clearingCache}>
              {clearingCache ? "Clearing cache..." : "Clear stale asset cache"}
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={() => void handleCopyDiagnostics()}>
            {copiedDiagnostics ? "Copied diagnostics" : "Copy diagnostics"}
          </button>
        </div>
        {cacheStatus ? <p className="muted">{cacheStatus}</p> : null}
        <LocalRecoveryCenter />
      </section>
    </main>
  );
}
