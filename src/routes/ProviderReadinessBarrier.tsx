import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { copyPerfDiagnostics } from "../lib/perf";
import { resetLocalEnvironment } from "../lib/resetEnvironment";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle, setDeepSignalDebugReadiness } from "../lib/routeDiagnostics";
import { readSelectedProjectIdFromStorage } from "./routeDiagnostics";

const LazyLocalRecoveryCenter = lazy(() =>
  import("../components/LocalRecoveryCenter").then((module) => ({
    default: module.LocalRecoveryCenter,
  })),
);

export const WORKSPACE_RECOVERY_TIMEOUT_MS = 3200;
const WORKSPACE_FALLBACK_DELAY_MS = 180;
const LOADING_FALLBACK_BODY_CLASS = "deepsignal-loading-fallback";

export function WorkspaceRestoreFallback({ onRetry }: { onRetry?: () => void }) {
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [resettingState, setResettingState] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecoveryVisible(true);
    }, WORKSPACE_RECOVERY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleResetLocalState() {
    setResettingState(true);
    try {
      await resetLocalEnvironment();
    } finally {
      window.location.assign("/");
    }
  }

  async function handleCopyDiagnostics() {
    try {
      await navigator.clipboard.writeText(formatRouteLifecycleDiagnostics());
    } catch {
      await copyPerfDiagnostics(["app:", "lazy:", "admin:", "public-form:"]);
    }
    setCopiedDiagnostics(true);
    window.setTimeout(() => setCopiedDiagnostics(false), 1800);
  }

  return (
    <div className="panel glow-panel route-status-panel route-status-panel-compact" role="status">
      <p className="eyebrow">Signal surface</p>
      <h1>Loading workspace...</h1>
      <p className="muted">Restoring your signal workspace and local fallback data.</p>
      {recoveryVisible ? (
        <div className="stack">
          <p className="muted">This is taking longer than expected, but local fallback data is still preserved.</p>
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
              Retry workspace
            </button>
            <button type="button" className="ghost-button" onClick={() => void handleCopyDiagnostics()}>
              {copiedDiagnostics ? "Copied diagnostics" : "Copy diagnostics"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => void handleResetLocalState()}
              disabled={resettingState}
            >
              {resettingState ? "Resetting local state..." : "Reset local state"}
            </button>
          </div>
          <details className="route-diagnostics-panel route-diagnostics-panel-compact">
            <summary>Technical details</summary>
            <pre className="route-status-diagnostics">{formatRouteLifecycleDiagnostics()}</pre>
          </details>
          <Suspense fallback={null}>
            <LazyLocalRecoveryCenter />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}

export function DelayedWorkspaceRestoreFallback({
  delayMs = WORKSPACE_FALLBACK_DELAY_MS,
  onRetry,
}: {
  delayMs?: number;
  onRetry?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    document.body.classList.add(LOADING_FALLBACK_BODY_CLASS);
    return () => {
      document.body.classList.remove(LOADING_FALLBACK_BODY_CLASS);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return visible ? <WorkspaceRestoreFallback onRetry={onRetry} /> : null;
}

export function ProviderReadinessBarrier({ children, routePath, enabled = true }: { children: ReactNode; routePath: string; enabled?: boolean }) {
  const [ready, setReady] = useState(!enabled);
  const [phase, setPhase] = useState("booting");

  useEffect(() => {
    if (!enabled) {
      setPhase("ready");
      setReady(true);
      setDeepSignalDebugReadiness({ hydrationPhase: "ready", routePath });
      return undefined;
    }

    let cancelled = false;
    setReady(false);
    const steps: Array<[string, () => Promise<void> | void]> = [
      ["router_hydrating", () => undefined],
      ["storage_hydrating", () => { void window.localStorage.getItem("deepsignal.storage.probe"); }],
      ["project_hydrating", () => { void readSelectedProjectIdFromStorage(); }],
      ["providers_ready", () => undefined],
    ];

    async function run() {
      for (const [nextPhase, task] of steps) {
        if (cancelled) {
          return;
        }
        setPhase(nextPhase);
        setDeepSignalDebugReadiness({ hydrationPhase: nextPhase, routePath });
        logRouteLifecycle("hydration:phase", { phase: nextPhase, routePath });
        try {
          await task();
        } catch (error) {
          setDeepSignalDebugReadiness({
            hydrationPhase: `${nextPhase}:storage-limited`,
            hydrationError: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (!cancelled) {
        setPhase("ready");
        setDeepSignalDebugReadiness({ hydrationPhase: "ready", routePath });
        setReady(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, routePath]);

  if (!ready) {
    return <DelayedWorkspaceRestoreFallback />;
  }

  void phase;
  return <>{children}</>;
}
