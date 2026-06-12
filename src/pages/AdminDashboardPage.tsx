import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { DashboardLiteWorkspace } from "../components/DashboardLiteWorkspace";
import {
  StaleLazyImportEpochError,
  getExpectedRouteChunkUrl,
  resolveLazyRouteModuleWithSafariRetry,
  retryLazyImport,
} from "../lib/lazyRetry";
import {
  markDashboardAdvancedTimingStart,
  recordDashboardAdvancedTiming,
} from "../lib/dashboardAdvancedInstrumentation";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { DelayedWorkspaceRestoreFallback } from "../routes/ProviderReadinessBarrier";
import { ensureCurrentRouteEpoch, useCurrentRouteEpoch } from "../routes/routeEpoch";
import { useWalletSessionState } from "../walletSessionState";
import { shouldAutoLoadAdvancedWorkspace } from "./adminDashboardWorkspaceAutoload";

type WorkspaceComponent = ComponentType<Record<string, never>>;

export function AdminDashboardPage() {
  const routePath =
    typeof window === "undefined" ? "/dashboard" : window.location.hash?.replace(/^#/, "") || window.location.pathname;
  const routeEpoch = useCurrentRouteEpoch(routePath);
  const walletSession = useWalletSessionState();
  const autoOpenAfterConnect = shouldAutoLoadAdvancedWorkspace(routePath);
  const autoLoadAdvancedWorkspace = autoOpenAfterConnect && walletSession.phase === "connected";
  const [retryNonce, setRetryNonce] = useState(0);
  const [Workspace, setWorkspace] = useState<WorkspaceComponent | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [advancedRequested, setAdvancedRequested] = useState(autoLoadAdvancedWorkspace);
  const requestSourceRef = useRef<"idle" | "manual">(autoLoadAdvancedWorkspace ? "idle" : "manual");

  const loadWorkspace = useCallback(async () => {
    setLoadError(null);
    ensureCurrentRouteEpoch(routePath);
    let importStartedAt = 0;
    try {
      const expectedChunkUrl = await getExpectedRouteChunkUrl("dashboard-workspace");
      logRouteLifecycle("dashboard:workspace-import-requested", {
        routePath,
        routeEpoch: routeEpoch.routeEpoch,
        retryNonce,
        requestSource: requestSourceRef.current,
        importTargetUrl: expectedChunkUrl,
      });
      importStartedAt = performance.now();
      recordDashboardAdvancedTiming("dashboard:workspace-import-start", {
        durationMs: 0,
        importTargetUrl: expectedChunkUrl,
        requestSource: requestSourceRef.current,
        retryNonce,
        routeEpoch: routeEpoch.routeEpoch,
        routePath,
      });
      const module = await retryLazyImport(
        () => import("./AdminDashboardWorkspace"),
        "dashboard-workspace",
      ).then((resolved) =>
        resolveLazyRouteModuleWithSafariRetry<Record<string, never>>(
          resolved,
          "dashboard-workspace",
          "AdminDashboardWorkspace",
        ),
      );
      setWorkspace(() => module.default);
      const resourceTiming =
        expectedChunkUrl && typeof performance !== "undefined" && typeof performance.getEntriesByName === "function"
          ? (() => {
              const entries = performance
                .getEntriesByName(expectedChunkUrl)
                .filter((entry): entry is PerformanceResourceTiming => "decodedBodySize" in entry);
              return entries[entries.length - 1] ?? null;
            })()
          : null;
      logRouteLifecycle("dashboard:workspace-deferred-import-resolved", {
        routePath,
        routeEpoch: routeEpoch.routeEpoch,
        retryNonce,
        requestSource: requestSourceRef.current,
        importTargetUrl: expectedChunkUrl,
        chunkDecodedBodySize: resourceTiming?.decodedBodySize ?? null,
        chunkTransferSize: resourceTiming?.transferSize ?? null,
      });
      recordDashboardAdvancedTiming("dashboard:workspace-import-resolved", {
        chunkDecodedBodySize: resourceTiming?.decodedBodySize ?? null,
        chunkTransferSize: resourceTiming?.transferSize ?? null,
        durationMs: Math.round(performance.now() - importStartedAt),
        importTargetUrl: expectedChunkUrl,
        requestSource: requestSourceRef.current,
        retryNonce,
        routeEpoch: routeEpoch.routeEpoch,
        routePath,
      });
    } catch (error) {
      if (error instanceof StaleLazyImportEpochError) {
        logRouteLifecycle("dashboard:workspace-deferred-import-stale-suppressed", {
          routePath,
          routeEpoch: routeEpoch.routeEpoch,
          retryNonce,
          message: error.message,
        });
        return;
      }
      setLoadError(error);
      setWorkspace(null);
      logRouteLifecycle("dashboard:workspace-deferred-import-failed", {
        routePath,
        routeEpoch: routeEpoch.routeEpoch,
        retryNonce,
        requestSource: requestSourceRef.current,
        errorName: error instanceof Error ? error.name : "Error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      recordDashboardAdvancedTiming("dashboard:workspace-import-failed", {
        durationMs: importStartedAt ? Math.round(performance.now() - importStartedAt) : 0,
        errorName: error instanceof Error ? error.name : "Error",
        errorMessage: error instanceof Error ? error.message : String(error),
        requestSource: requestSourceRef.current,
        retryNonce,
        routeEpoch: routeEpoch.routeEpoch,
        routePath,
      });
    }
  }, [retryNonce, routeEpoch.routeEpoch, routePath]);

  useEffect(() => {
    let cancelled = false;
    if (!advancedRequested) {
      return () => {
        cancelled = true;
      };
    }
    void loadWorkspace().catch((error) => {
      if (cancelled || error instanceof StaleLazyImportEpochError) {
        return;
      }
      throw error;
    });
    return () => {
      cancelled = true;
    };
  }, [advancedRequested, loadWorkspace]);

  useEffect(() => {
    if (!autoLoadAdvancedWorkspace || advancedRequested) {
      return undefined;
    }
    requestSourceRef.current = "idle";
    setAdvancedRequested(true);
    return undefined;
  }, [advancedRequested, autoLoadAdvancedWorkspace]);

  const handleOpenAdvancedWorkspace = useCallback(() => {
    requestSourceRef.current = "manual";
    markDashboardAdvancedTimingStart(routePath, {
      retryNonce,
      requestSource: "manual",
    });
    setAdvancedRequested(true);
  }, [retryNonce, routePath]);

  if (Workspace) {
    return <Workspace />;
  }

  if (autoLoadAdvancedWorkspace && advancedRequested && !loadError) {
    return (
      <DelayedWorkspaceRestoreFallback
        onRetry={() => {
          setRetryNonce((value) => value + 1);
          handleOpenAdvancedWorkspace();
        }}
      />
    );
  }

  return (
    <DashboardLiteWorkspace
      advancedLoadError={loadError}
      advancedLoading={advancedRequested && !loadError && !Workspace}
      autoOpenAfterConnect={autoOpenAfterConnect}
      onOpenAdvancedWorkspace={() => {
        if (loadError) {
          setRetryNonce((value) => value + 1);
        }
        handleOpenAdvancedWorkspace();
      }}
      routePath={routePath}
      walletSessionPhase={walletSession.phase}
    />
  );
}
