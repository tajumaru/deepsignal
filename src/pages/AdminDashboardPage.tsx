import { useCallback, useEffect, useState, type ComponentType } from "react";
import { DashboardLocalShellFallback } from "../components/DashboardLocalShellFallback";
import { resolveLazyRouteModuleWithSafariRetry, retryLazyImport } from "../lib/lazyRetry";
import { logRouteLifecycle } from "../lib/routeDiagnostics";

type WorkspaceComponent = ComponentType<Record<string, never>>;

export function AdminDashboardPage() {
  const [retryNonce, setRetryNonce] = useState(0);
  const [Workspace, setWorkspace] = useState<WorkspaceComponent | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const routePath =
    typeof window === "undefined" ? "/dashboard" : window.location.hash?.replace(/^#/, "") || window.location.pathname;

  const loadWorkspace = useCallback(async () => {
    setLoadError(null);
    try {
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
      logRouteLifecycle("dashboard:workspace-deferred-import-resolved", {
        routePath,
        retryNonce,
      });
    } catch (error) {
      setLoadError(error);
      setWorkspace(null);
      logRouteLifecycle("dashboard:workspace-deferred-import-failed", {
        routePath,
        retryNonce,
        errorName: error instanceof Error ? error.name : "Error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }, [retryNonce, routePath]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  if (Workspace) {
    return <Workspace />;
  }

  return (
    <DashboardLocalShellFallback
      error={loadError}
      onRetry={() => setRetryNonce((value) => value + 1)}
      routePath={routePath}
      title={loadError ? "Advanced dashboard failed to load." : "Preparing dashboard shell..."}
    />
  );
}
