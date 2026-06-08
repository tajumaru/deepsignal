import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { InitialBootReady, useBootOverlay } from "./bootstrap/useBootOverlay";
import { DashboardDegradedShell } from "./components/DashboardDegradedShell";
import { BuildUpdateBanner } from "./components/system/BuildUpdateBanner";
import {
  getMixedBuildStatus,
  recordBuildAsset,
  recoverFromMixedBuildAssets,
} from "./lib/buildAssetDiagnostics";
import { isDashboardWorkspaceReady, useDashboardProjectRestore, useDashboardProjectRestoreSnapshot } from "./lib/dashboardProjectRestore";
import { retryLazyImport } from "./lib/lazyRetry";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { scheduleIdleTask } from "./lib/scheduleIdleTask";
import { LandingPage } from "./pages/LandingPage";
import { AppRoutes } from "./routes/AppRoutes";
import { createAppRouteComponents, type AppRouteComponents } from "./routes/appRouteComponents";
import {
  DelayedWorkspaceRestoreFallback,
  ProviderReadinessBarrier,
} from "./routes/ProviderReadinessBarrier";
import { PublicAppRoutes } from "./routes/PublicAppRoutes";
import { createPublicRouteComponents, type PublicRouteComponents } from "./routes/publicRouteComponents";
import { MixedBuildRecoveryScreen, RouteErrorBoundary } from "./routes/RouteErrorBoundary";
import { getRouteId } from "./routes/routeDiagnostics";

const AppShell = lazy(() =>
  retryLazyImport(() => import("./components/AppShell"), "app-shell").then((module) => ({
    default: module.AppShell,
  })),
);
const PublicAppShell = lazy(() =>
  retryLazyImport(() => import("./components/PublicAppShell"), "public-app-shell").then((module) => ({
    default: module.PublicAppShell,
  })),
);

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

function RouteReady({
  children,
  routePath,
  onReady,
  workspaceReady = true,
}: {
  children: ReactNode;
  routePath: string;
  onReady: () => void;
  workspaceReady?: boolean;
}) {
  return (
    <InitialBootReady routePath={routePath} onReady={onReady} workspaceReady={workspaceReady}>
      {children}
    </InitialBootReady>
  );
}

function AppRouteRuntimeEffects({ enabled, routePath }: { enabled: boolean; routePath: string }) {
  const dashboardProjectRestore = useDashboardProjectRestoreSnapshot();
  const dashboardShellRoute = routePath === "/dashboard" || routePath.startsWith("/dashboard?");

  useEffect(() => {
    if (!enabled) {
      setDeepSignalDebugReadiness({
        routeProviderGuard: "deferred",
        workspaceProjectProvider: "deferred",
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
          dashboardShellRoute &&
          (dashboardProjectRestore.state === "unknown" || dashboardProjectRestore.state === "restoring")
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
  }, [dashboardProjectRestore.state, dashboardShellRoute, enabled]);

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

function PublicRouteSurface({
  components,
  locationKey,
  mixedBuildStatus,
  onRetryRoute,
  onRouteReady,
  routePath,
  routeRetryNonce,
}: {
  components: PublicRouteComponents;
  locationKey: string;
  mixedBuildStatus: ReturnType<typeof getMixedBuildStatus>;
  onRetryRoute: () => void;
  onRouteReady: () => void;
  routePath: string;
  routeRetryNonce: number;
}) {
  return (
    <PublicAppShell>
      <BuildUpdateBanner />
      <RouteErrorBoundary
        resetKey={`${locationKey}:${routeRetryNonce}`}
        routePath={routePath}
        onRetryRoute={onRetryRoute}
      >
        {mixedBuildStatus.detected ? (
          <RouteReady routePath={routePath} onReady={onRouteReady}>
            <MixedBuildRecoveryScreen observed={mixedBuildStatus.observed} />
          </RouteReady>
        ) : (
          <Suspense fallback={<DelayedWorkspaceRestoreFallback />}>
            <RouteReady routePath={routePath} onReady={onRouteReady}>
              <PublicAppRoutes components={components} />
            </RouteReady>
          </Suspense>
        )}
      </RouteErrorBoundary>
    </PublicAppShell>
  );
}

function PrivateRouteSurface({
  components,
  locationKey,
  mixedBuildStatus,
  onRetryRoute,
  onRouteReady,
  routeShowsWalletUi,
  routeNeedsWorkspaceBoot,
  routeIsDashboardShell,
  routePath,
  routeRetryNonce,
  workspaceReady,
}: {
  components: AppRouteComponents;
  locationKey: string;
  mixedBuildStatus: ReturnType<typeof getMixedBuildStatus>;
  onRetryRoute: () => void;
  onRouteReady: () => void;
  routeShowsWalletUi: boolean;
  routeNeedsWorkspaceBoot: boolean;
  routeIsDashboardShell: boolean;
  routePath: string;
  routeRetryNonce: number;
  workspaceReady: boolean;
}) {
  const shellFallback =
    routeIsDashboardShell ? (
      <RouteReady routePath={routePath} onReady={onRouteReady} workspaceReady={false}>
        <DashboardDegradedShell onRetryImports={onRetryRoute} routePath={routePath} />
      </RouteReady>
    ) : (
      <DelayedWorkspaceRestoreFallback />
    );

  return (
    <RouteErrorBoundary
      resetKey={`${locationKey}:${routeRetryNonce}:shell`}
      routePath={routePath}
      onRetryRoute={onRetryRoute}
    >
      <Suspense fallback={shellFallback}>
        <AppShell
          walletUiEnabled={routeShowsWalletUi}
          walletUiRequested={routeShowsWalletUi && !routeIsDashboardShell}
          chrome="full"
        >
          <BuildUpdateBanner />
          <AppRouteRuntimeEffects enabled={routeNeedsWorkspaceBoot} routePath={routePath} />
          {mixedBuildStatus.detected ? (
            <RouteReady routePath={routePath} onReady={onRouteReady}>
              <MixedBuildRecoveryScreen observed={mixedBuildStatus.observed} />
            </RouteReady>
          ) : (
            <Suspense fallback={<DelayedWorkspaceRestoreFallback />}>
              <RouteReady routePath={routePath} onReady={onRouteReady} workspaceReady={workspaceReady}>
                <ProviderReadinessBarrier routePath={routePath} enabled={routeNeedsWorkspaceBoot}>
                  <AppRoutes components={components} onRetryRoute={onRetryRoute} routeRetryNonce={routeRetryNonce} />
                </ProviderReadinessBarrier>
              </RouteReady>
            </Suspense>
          )}
        </AppShell>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export default function App() {
  const location = useLocation();
  const routeIsLanding = location.pathname === "/";
  const routeUsesPublicChrome =
    location.pathname.startsWith("/f/") ||
    location.pathname.startsWith("/roadmap/") ||
    location.pathname.startsWith("/m/") ||
    location.pathname.startsWith("/auth/zklogin/");
  const [initialRouteReady, setInitialRouteReady] = useState(false);
  const [bootDismissed, setBootDismissed] = useState(false);
  const [mixedBuildStatus, setMixedBuildStatus] = useState(() => getMixedBuildStatus());
  const [routeRetryNonce, setRouteRetryNonce] = useState(0);
  const appRouteComponents = useMemo(() => createAppRouteComponents(routeRetryNonce), [routeRetryNonce]);
  const publicRouteComponents = useMemo(() => createPublicRouteComponents(routeRetryNonce), [routeRetryNonce]);
  const routeShowsWalletUi =
    location.pathname === "/admin" ||
    location.pathname === "/dashboard" ||
    location.pathname === "/create" ||
    location.pathname === "/compose" ||
    location.pathname === "/troubleshooting" ||
    location.pathname === "/submitted" ||
    location.pathname.startsWith("/submitted/") ||
    location.pathname === "/my-submissions" ||
    location.pathname.startsWith("/my-submissions/") ||
    location.pathname.startsWith("/admin/") ||
    location.pathname.startsWith("/dashboard/");
  const routeNeedsWorkspaceBoot = !routeIsLanding && !routeUsesPublicChrome;
  const routePath = `${location.pathname}${location.search}${location.hash}`;
  const dashboardProjectRestore = useDashboardProjectRestore(routePath, location.pathname === "/dashboard");
  const workspaceReadyForRoute = location.pathname === "/dashboard" ? isDashboardWorkspaceReady(dashboardProjectRestore) : true;

  useBootOverlay({
    bootDismissed,
    initialRouteReady,
    routeIsLanding,
    setBootDismissed,
  });

  useEffect(() => {
    const status = recordBuildAsset(`route:${getRouteId(`${location.pathname}${location.search}${location.hash}`)}`);
    setMixedBuildStatus(status);
    if (status.detected) {
      logRouteLifecycle("mixed_build_assets_detected", {
        routePath: `${location.pathname}${location.search}${location.hash}`,
        root: status.root,
        observed: status.observed,
        reason: status.reason,
      });
      recoverFromMixedBuildAssets(status);
    }
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    logRouteLifecycle("route:enter", {
      routePath: `${location.pathname}${location.search}${location.hash}`,
      pathname: location.pathname,
      hash: location.hash || "",
      browserPathname: typeof window === "undefined" ? location.pathname : window.location.pathname,
      browserHash: typeof window === "undefined" ? location.hash : window.location.hash,
      walletSurface: routeShowsWalletUi,
      publicChrome: routeUsesPublicChrome,
    });
    return () => {
      logRouteLifecycle("route:leave", {
        routePath: `${location.pathname}${location.search}${location.hash}`,
      });
    };
  }, [location.hash, location.pathname, location.search, routeShowsWalletUi, routeUsesPublicChrome]);

  useEffect(() => {
    setDeepSignalDebugReadiness({
      workspaceReady: workspaceReadyForRoute,
    });
  }, [workspaceReadyForRoute]);

  useEffect(() => {
    if (location.pathname !== "/") {
      return undefined;
    }
    return scheduleIdleTask(() => prefetchExploreRoute(), 3500);
  }, [location.pathname]);

  useEffect(() => {
    if (
      routeUsesPublicChrome ||
      location.pathname === "/admin" ||
      location.pathname === "/dashboard" ||
      !shouldPrefetchAdminWorkspace(location.pathname)
    ) {
      return undefined;
    }
    return scheduleIdleTask(() => prefetchInboxWorkspaceRoute(), location.pathname === "/" ? 1400 : 900);
  }, [location.pathname, routeUsesPublicChrome]);

  if (routeIsLanding) {
    return (
      <RouteErrorBoundary
        resetKey={`${location.key}:landing:${routeRetryNonce}`}
        routePath={routePath}
        onRetryRoute={() => setRouteRetryNonce((value) => value + 1)}
      >
        <BuildUpdateBanner />
        <RouteReady routePath={routePath} onReady={() => setInitialRouteReady(true)}>
          <LandingPage />
        </RouteReady>
      </RouteErrorBoundary>
    );
  }

  if (routeUsesPublicChrome) {
    return (
      <Suspense fallback={<DelayedWorkspaceRestoreFallback />}>
        <PublicRouteSurface
          components={publicRouteComponents}
          locationKey={location.key}
          mixedBuildStatus={mixedBuildStatus}
          onRetryRoute={() => setRouteRetryNonce((value) => value + 1)}
          onRouteReady={() => setInitialRouteReady(true)}
          routePath={routePath}
          routeRetryNonce={routeRetryNonce}
        />
      </Suspense>
    );
  }

  return (
    <PrivateRouteSurface
      components={appRouteComponents}
      locationKey={location.key}
      mixedBuildStatus={mixedBuildStatus}
      onRetryRoute={() => setRouteRetryNonce((value) => value + 1)}
      onRouteReady={() => setInitialRouteReady(true)}
      routeShowsWalletUi={routeShowsWalletUi}
      routeNeedsWorkspaceBoot={routeNeedsWorkspaceBoot}
      routeIsDashboardShell={location.pathname === "/dashboard"}
      routePath={routePath}
      routeRetryNonce={routeRetryNonce}
      workspaceReady={workspaceReadyForRoute}
    />
  );
}
