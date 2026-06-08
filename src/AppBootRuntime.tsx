import { useEffect } from "react";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { scheduleIdleTask } from "./lib/scheduleIdleTask";
import { retryLazyImport } from "./lib/lazyRetry";
import { isDashboardBootPending, useDashboardProjectRestoreSnapshot } from "./lib/dashboardProjectRestore";

function prefetchExploreRoute() {
  void retryLazyImport(() => import("./pages/ExploreSignalsPage"), "prefetch-route-explore").catch(() => undefined);
}

function prefetchInboxWorkspaceRoute() {
  void Promise.allSettled([
    retryLazyImport(() => import("./pages/AdminDashboardPage"), "prefetch-route-admin-dashboard"),
    import("./components/AppShell"),
    import("./lib/projectRegistry"),
    import("./storage/storageFactory"),
  ]);
}

function shouldPrefetchAdminWorkspace(pathname: string) {
  if (typeof window === "undefined") {
    return false;
  }
  const capabilities = getBrowserCapabilitiesSnapshot();
  const mobileSafari = Boolean(capabilities.mobileSafari);
  const isDesktopViewport = window.matchMedia?.("(min-width: 901px)").matches ?? true;
  const routeBlocksPrefetch =
    pathname === "/create" ||
    pathname === "/compose" ||
    pathname === "/explore" ||
    pathname === "/signals" ||
    pathname.startsWith("/f/");
  if (mobileSafari || routeBlocksPrefetch) {
    return false;
  }
  return isDesktopViewport && document.visibilityState === "visible";
}

export function WorkspaceRouteRuntimeEffects({
  blockedWalletRequired = false,
  enabled,
  routePath,
}: {
  blockedWalletRequired?: boolean;
  enabled: boolean;
  routePath: string;
}) {
  const dashboardProjectRestore = useDashboardProjectRestoreSnapshot();
  const dashboardShellRoute = routePath === "/dashboard" || routePath.startsWith("/dashboard?");
  const dashboardBootPending = isDashboardBootPending(dashboardProjectRestore);

  useEffect(() => {
    if (!enabled) {
      setDeepSignalDebugReadiness({
        routeProviderGuard: "deferred",
        workspaceProjectProvider: blockedWalletRequired ? "blocked_wallet_required" : "deferred",
        projectRestoreState: blockedWalletRequired ? "blocked_wallet_required" : undefined,
        storageProvider: "deferred",
        storageNotice: null,
      });
      return undefined;
    }

    let cancelled = false;
    void Promise.all([import("./lib/projectRegistry"), import("./storage/storageFactory")])
      .then(([projectRegistry, storageFactory]) => {
        if (cancelled) {
          return;
        }
        const storageRuntime = storageFactory.getStorageRuntimeStatus();
        const workspaceProjectProvider =
          dashboardShellRoute && dashboardBootPending
            ? "restoring"
            : projectRegistry.getSelectedProjectId()
              ? "selected"
              : "empty";
        setDeepSignalDebugReadiness({
          routeProviderGuard: "ready",
          workspaceProjectProvider,
          storageProvider: storageRuntime.mode,
          storageNotice: storageRuntime.notice,
        });
      })
      .catch((error) => {
        console.warn("[app] route runtime diagnostics failed to start", error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    dashboardBootPending,
    dashboardProjectRestore.state,
    dashboardShellRoute,
    enabled,
    blockedWalletRequired,
  ]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    function retryPendingInboxSync() {
      void import("./storage/storageFactory")
        .then(({ retryPendingSubmissionSync }) => retryPendingSubmissionSync({ allowWalletPrompt: false }))
        .catch((error) => {
          console.warn("[app] pending inbox sync retry failed to start", error);
        });
    }

    retryPendingInboxSync();
    window.addEventListener("online", retryPendingInboxSync);
    return () => window.removeEventListener("online", retryPendingInboxSync);
  }, [enabled]);

  return null;
}

export function AppBootRuntime({
  dashboardGateCurrentProjectId,
  dashboardGateSource,
  dashboardGateState,
  dashboardGateWalletRuntime,
  dashboardSnapshotWalletRuntime,
  dashboardWalletSettled,
  pathname,
  routePath,
  routeShowsWalletUi,
  routeUsesPublicChrome,
  walletProviderLoading,
  walletProviderMounted,
  walletRequiredGateStatus,
  walletSessionPhase,
  workspaceReadyForRoute,
}: {
  dashboardGateCurrentProjectId: string;
  dashboardGateSource: string;
  dashboardGateState: string;
  dashboardGateWalletRuntime: string;
  dashboardSnapshotWalletRuntime: string;
  dashboardWalletSettled: boolean;
  pathname: string;
  routePath: string;
  routeShowsWalletUi: boolean;
  routeUsesPublicChrome: boolean;
  walletProviderLoading: boolean;
  walletProviderMounted: boolean;
  walletRequiredGateStatus: "allowed" | "disconnected" | "provider_pending";
  walletSessionPhase: string;
  workspaceReadyForRoute: boolean;
}) {
  useEffect(() => {
    logRouteLifecycle("route:enter", {
      routePath,
      pathname,
      hash: typeof window === "undefined" ? "" : window.location.hash || "",
      browserPathname: typeof window === "undefined" ? pathname : window.location.pathname,
      browserHash: typeof window === "undefined" ? "" : window.location.hash,
      walletSurface: routeShowsWalletUi,
      publicChrome: routeUsesPublicChrome,
    });
    return () => {
      logRouteLifecycle("route:leave", {
        routePath,
      });
    };
  }, [pathname, routePath, routeShowsWalletUi, routeUsesPublicChrome]);

  useEffect(() => {
    setDeepSignalDebugReadiness({
      workspaceReady: workspaceReadyForRoute,
    });
  }, [workspaceReadyForRoute]);

  useEffect(() => {
    if (pathname !== "/dashboard") {
      return;
    }
    setDeepSignalDebugReadiness({
      projectRestoreState: walletRequiredGateStatus === "disconnected" ? "blocked_wallet_required" : undefined,
    });
  }, [pathname, walletRequiredGateStatus]);

  useEffect(() => {
    if (pathname !== "/dashboard" || walletRequiredGateStatus !== "allowed") {
      return;
    }
    if (pathname !== "/dashboard" || dashboardWalletSettled) {
      return;
    }
    logRouteLifecycle("project-restore-blocked", {
      providerLoading: walletProviderLoading,
      providerMounted: walletProviderMounted,
      walletSessionPhase,
      walletStatus: walletSessionPhase,
      walletRuntime: dashboardSnapshotWalletRuntime,
    });
    logRouteLifecycle("project-restore:blocked-wallet-pending", {
      routePath,
      walletRuntime: dashboardSnapshotWalletRuntime,
      providerLoading: walletProviderLoading,
      walletProviderPending: !walletProviderMounted,
      providerMounted: walletProviderMounted,
      walletSessionPhase,
    });
  }, [
    dashboardSnapshotWalletRuntime,
    dashboardWalletSettled,
    pathname,
    routePath,
    walletProviderLoading,
    walletProviderMounted,
    walletRequiredGateStatus,
    walletSessionPhase,
  ]);

  useEffect(() => {
    if (pathname !== "/dashboard" || walletRequiredGateStatus !== "allowed" || workspaceReadyForRoute) {
      return;
    }
    logRouteLifecycle("dashboard-gate-blocked", {
      projectRestoreCurrentProjectId: dashboardGateState === "ready_with_project" ? dashboardGateCurrentProjectId : "",
      projectRestoreSource: dashboardGateSource,
      projectRestoreState: dashboardGateState,
      routePath,
      walletProviderLoading,
      walletProviderMounted,
      walletRuntime: dashboardGateWalletRuntime,
      walletSessionPhase,
    });
  }, [
    dashboardGateCurrentProjectId,
    dashboardGateSource,
    dashboardGateState,
    dashboardGateWalletRuntime,
    pathname,
    routePath,
    walletProviderLoading,
    walletProviderMounted,
    walletRequiredGateStatus,
    walletSessionPhase,
    workspaceReadyForRoute,
  ]);

  useEffect(() => {
    if (pathname !== "/") {
      return undefined;
    }
    return scheduleIdleTask(() => prefetchExploreRoute(), 3500);
  }, [pathname]);

  useEffect(() => {
    if (
      routeUsesPublicChrome ||
      pathname === "/admin" ||
      pathname === "/dashboard" ||
      !shouldPrefetchAdminWorkspace(pathname)
    ) {
      return undefined;
    }
    return scheduleIdleTask(() => prefetchInboxWorkspaceRoute(), pathname === "/" ? 1400 : 900);
  }, [pathname, routeUsesPublicChrome]);

  return null;
}
