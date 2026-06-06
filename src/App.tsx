import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { retryLazyImport } from "./lib/lazyRetry";
import { InitialBootReady, useBootOverlay } from "./bootstrap/useBootOverlay";
import { DashboardFallbackShell } from "./components/DashboardFallbackShell";
import { BuildUpdateBanner } from "./components/system/BuildUpdateBanner";
import {
  getMixedBuildStatus,
  recordBuildAsset,
  recoverFromMixedBuildAssets,
} from "./lib/buildAssetDiagnostics";
import {
  isDashboardWalletRuntimeSettled,
  isDashboardWorkspaceReady,
  useDashboardProjectRestore,
  useDashboardProjectRestoreSnapshot,
} from "./lib/dashboardProjectRestore";
import { logRouteLifecycle } from "./lib/routeDiagnostics";
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
import { useWalletSessionState, type WalletSessionState } from "./walletSessionState";

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
const AppBootRuntime = lazy(() =>
  import("./AppBootRuntime").then((module) => ({
    default: module.AppBootRuntime,
  })),
);
const WorkspaceRouteRuntimeEffects = lazy(() =>
  import("./AppBootRuntime").then((module) => ({
    default: module.WorkspaceRouteRuntimeEffects,
  })),
);

function RouteReady({
  children,
  routePath,
  onReady,
  reportInteractive = true,
  reportRouteReady = true,
  workspaceReady = true,
}: {
  children: ReactNode;
  routePath: string;
  onReady: () => void;
  reportInteractive?: boolean;
  reportRouteReady?: boolean;
  workspaceReady?: boolean;
}) {
  return (
    <InitialBootReady
      routePath={routePath}
      onReady={onReady}
      reportInteractive={reportInteractive}
      reportRouteReady={reportRouteReady}
      workspaceReady={workspaceReady}
    >
      {children}
    </InitialBootReady>
  );
}

function PublicRouteSurface({
  components,
  locationKey,
  mixedBuildStatus,
  onRetryRoute,
  onRouteReady,
  routePath,
  routeRetryNonce,
  walletSession,
}: {
  components: PublicRouteComponents;
  locationKey: string;
  mixedBuildStatus: ReturnType<typeof getMixedBuildStatus>;
  onRetryRoute: () => void;
  onRouteReady: () => void;
  routePath: string;
  routeRetryNonce: number;
  walletSession: WalletSessionState;
}) {
  const mountIdRef = useRef(`public-route-${Math.round(performance.now())}`);
  const renderCountRef = useRef(0);
  const initialRouteLifecycleRef = useRef({
    routePath,
    walletSessionPhase: walletSession.phase,
    walletProviderMounted: walletSession.providerMounted,
  });
  renderCountRef.current += 1;

  useEffect(() => {
    logRouteLifecycle("public-route:remount", {
      mountId: mountIdRef.current,
      routePath: initialRouteLifecycleRef.current.routePath,
      renderCount: renderCountRef.current,
      walletSessionPhase: initialRouteLifecycleRef.current.walletSessionPhase,
      walletProviderMounted: initialRouteLifecycleRef.current.walletProviderMounted,
    });
  }, []);

  useEffect(() => {
    if (!walletSession.providerMounted && !walletSession.providerLoading) {
      return;
    }
    logRouteLifecycle("public-route:rerender-after-wallet", {
      routePath,
      renderCount: renderCountRef.current,
      walletSessionPhase: walletSession.phase,
      walletProviderLoading: walletSession.providerLoading,
      walletProviderMounted: walletSession.providerMounted,
      walletStatus: walletSession.status,
    });
  }, [
    routePath,
    walletSession.phase,
    walletSession.providerLoading,
    walletSession.providerMounted,
    walletSession.status,
  ]);

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
  walletSessionPhase,
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
  walletSessionPhase: "provider_deferred" | "restoring" | "disconnected" | "connected";
  workspaceReady: boolean;
}) {
  const shellFallback =
    routeIsDashboardShell ? (
      <RouteReady
        routePath={routePath}
        onReady={onRouteReady}
        reportInteractive={false}
        reportRouteReady={false}
        workspaceReady={false}
      >
        <DashboardFallbackShell onRetryImports={onRetryRoute} routePath={routePath} />
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
        <AppShell walletSessionPhase={walletSessionPhase} walletUiEnabled={routeShowsWalletUi} chrome="full">
          <BuildUpdateBanner />
          <Suspense fallback={null}>
            <WorkspaceRouteRuntimeEffects enabled={routeNeedsWorkspaceBoot} routePath={routePath} />
          </Suspense>
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
  const walletSession = useWalletSessionState();
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
  const dashboardProjectRestoreSnapshot = useDashboardProjectRestoreSnapshot();
  const dashboardWalletSettled = isDashboardWalletRuntimeSettled(dashboardProjectRestoreSnapshot.walletRuntime);
  const dashboardRestoreEnabled = location.pathname === "/dashboard" && dashboardWalletSettled;
  const dashboardProjectRestore = useDashboardProjectRestore(routePath, dashboardRestoreEnabled);
  const workspaceReadyForRoute = location.pathname === "/dashboard" ? isDashboardWorkspaceReady(dashboardProjectRestore) : true;
  const runtimeNode = (
    <Suspense fallback={null}>
      <AppBootRuntime
        dashboardGateCurrentProjectId={dashboardProjectRestore.currentProjectId}
        dashboardGateSource={dashboardProjectRestore.source}
        dashboardGateState={dashboardProjectRestore.state}
        dashboardGateWalletRuntime={dashboardProjectRestore.walletRuntime}
        dashboardSnapshotWalletRuntime={dashboardProjectRestore.walletRuntime}
        dashboardWalletSettled={dashboardWalletSettled}
        pathname={location.pathname}
        routePath={routePath}
        routeShowsWalletUi={routeShowsWalletUi}
        routeUsesPublicChrome={routeUsesPublicChrome}
        walletProviderLoading={walletSession.providerLoading}
        walletProviderMounted={walletSession.providerMounted}
        walletSessionPhase={walletSession.phase}
        workspaceReadyForRoute={workspaceReadyForRoute}
      />
    </Suspense>
  );

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

  if (routeIsLanding) {
    return (
      <>
        {runtimeNode}
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
      </>
    );
  }

  if (routeUsesPublicChrome) {
    return (
      <>
        {runtimeNode}
        <Suspense fallback={<DelayedWorkspaceRestoreFallback />}>
          <PublicRouteSurface
            components={publicRouteComponents}
            locationKey={location.key}
            mixedBuildStatus={mixedBuildStatus}
            onRetryRoute={() => setRouteRetryNonce((value) => value + 1)}
            onRouteReady={() => setInitialRouteReady(true)}
            routePath={routePath}
            routeRetryNonce={routeRetryNonce}
            walletSession={walletSession}
          />
        </Suspense>
      </>
    );
  }

  const routeSurface = (
    <>
      {runtimeNode}
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
        walletSessionPhase={walletSession.phase}
        workspaceReady={workspaceReadyForRoute}
      />
    </>
  );

  return routeSurface;
}
