import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { DashboardLiteWorkspace } from "../components/DashboardLiteWorkspace";
import {
  StaleLazyImportEpochError,
  getExpectedRouteChunkUrl,
  resolveLazyRouteModuleWithSafariRetry,
  retryLazyImport,
} from "../lib/lazyRetry";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle } from "../lib/routeDiagnostics";
import { scheduleIdleTask } from "../lib/scheduleIdleTask";
import { ensureCurrentRouteEpoch, useCurrentRouteEpoch } from "../routes/routeEpoch";

type WorkspaceComponent = ComponentType<Record<string, never>>;

function shouldAutoLoadAdvancedWorkspace(routePath: string) {
  if (typeof window === "undefined") {
    return false;
  }
  const pathname = routePath.split(/[?#]/)[0] || "/dashboard";
  if (pathname !== "/admin") {
    return false;
  }
  if (getBrowserCapabilitiesSnapshot().mobileSafari) {
    return false;
  }
  return window.matchMedia?.("(min-width: 901px)").matches ?? true;
}

export function AdminDashboardPage() {
  const [retryNonce, setRetryNonce] = useState(0);
  const [Workspace, setWorkspace] = useState<WorkspaceComponent | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [advancedRequested, setAdvancedRequested] = useState(false);
  const routePath =
    typeof window === "undefined" ? "/dashboard" : window.location.hash?.replace(/^#/, "") || window.location.pathname;
  const routeEpoch = useCurrentRouteEpoch(routePath);
  const requestSourceRef = useRef<"idle" | "manual">("manual");

  const loadWorkspace = useCallback(async () => {
    setLoadError(null);
    ensureCurrentRouteEpoch(routePath);
    try {
      const expectedChunkUrl = await getExpectedRouteChunkUrl("dashboard-workspace");
      logRouteLifecycle("dashboard:workspace-import-requested", {
        routePath,
        routeEpoch: routeEpoch.routeEpoch,
        retryNonce,
        requestSource: requestSourceRef.current,
        importTargetUrl: expectedChunkUrl,
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
    if (!shouldAutoLoadAdvancedWorkspace(routePath)) {
      return undefined;
    }
    return scheduleIdleTask(() => {
      requestSourceRef.current = "idle";
      setAdvancedRequested(true);
    }, 1400);
  }, [routePath]);

  const handleOpenAdvancedWorkspace = useCallback(() => {
    requestSourceRef.current = "manual";
    setAdvancedRequested(true);
  }, []);

  if (Workspace) {
    return <Workspace />;
  }

  return (
    <DashboardLiteWorkspace
      advancedLoadError={loadError}
      advancedLoading={advancedRequested && !loadError && !Workspace}
      onOpenAdvancedWorkspace={() => {
        if (loadError) {
          setRetryNonce((value) => value + 1);
        }
        handleOpenAdvancedWorkspace();
      }}
      routePath={routePath}
    />
  );
}
