import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { BuildUpdateBanner } from "../components/system/BuildUpdateBanner";
import { AppBootRuntime } from "../AppBootRuntime";
import { useBootOverlay, InitialBootReady } from "../bootstrap/useBootOverlay";
import { getMixedBuildStatus, recordBuildAsset, recoverFromMixedBuildAssets } from "../lib/buildAssetDiagnostics";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { PublicAppRoutes } from "../routes/PublicAppRoutes";
import { createPublicRouteComponents } from "../routes/publicRouteComponents";
import { DelayedWorkspaceRestoreFallback } from "../routes/ProviderReadinessBarrier";
import { MixedBuildRecoveryScreen, RouteErrorBoundary } from "../routes/RouteErrorBoundary";
import { getRouteId } from "../routes/routeDiagnostics";
import { useWalletSessionState, type WalletSessionState } from "../walletSessionState";
import { PublicAppShell } from "../components/PublicAppShell";

function RouteReady({
  children,
  onReady,
  reportInteractive = true,
  reportRouteReady = true,
  routePath,
  workspaceReady = true,
}: {
  children: ReactNode;
  onReady: () => void;
  reportInteractive?: boolean;
  reportRouteReady?: boolean;
  routePath: string;
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
  locationKey,
  mixedBuildStatus,
  onRetryRoute,
  onRouteReady,
  routePath,
  routeRetryNonce,
  walletSession,
}: {
  locationKey: string;
  mixedBuildStatus: ReturnType<typeof getMixedBuildStatus>;
  onRetryRoute: () => void;
  onRouteReady: () => void;
  routePath: string;
  routeRetryNonce: number;
  walletSession: WalletSessionState;
}) {
  const components = useMemo(() => createPublicRouteComponents(routeRetryNonce), [routeRetryNonce]);
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

export function PublicChromeSurface() {
  const location = useLocation();
  const walletSession = useWalletSessionState();
  const routePath = `${location.pathname}${location.search}${location.hash}`;
  const [initialRouteReady, setInitialRouteReady] = useState(false);
  const [bootDismissed, setBootDismissed] = useState(false);
  const [mixedBuildStatus, setMixedBuildStatus] = useState(() => getMixedBuildStatus());
  const [routeRetryNonce, setRouteRetryNonce] = useState(0);

  useBootOverlay({
    bootDismissed,
    initialRouteReady,
    routeIsLanding: false,
    setBootDismissed,
  });

  useEffect(() => {
    const status = recordBuildAsset(`route:${getRouteId(routePath)}`);
    setMixedBuildStatus(status);
    if (status.detected) {
      logRouteLifecycle("mixed_build_assets_detected", {
        routePath,
        root: status.root,
        observed: status.observed,
        reason: status.reason,
      });
      recoverFromMixedBuildAssets(status);
    }
  }, [routePath]);

  return (
    <>
      <Suspense fallback={null}>
        <AppBootRuntime
          dashboardGateCurrentProjectId=""
          dashboardGateSource="public"
          dashboardGateState="public"
          dashboardGateWalletRuntime="deferred"
          dashboardSnapshotWalletRuntime="deferred"
          dashboardWalletSettled={true}
          pathname={location.pathname}
          routePath={routePath}
          routeShowsWalletUi={false}
          routeUsesPublicChrome={true}
          walletProviderLoading={walletSession.providerLoading}
          walletProviderMounted={walletSession.providerMounted}
          walletSessionPhase={walletSession.phase}
          workspaceReadyForRoute={true}
        />
      </Suspense>
      <PublicRouteSurface
        locationKey={location.key}
        mixedBuildStatus={mixedBuildStatus}
        onRetryRoute={() => setRouteRetryNonce((value) => value + 1)}
        onRouteReady={() => setInitialRouteReady(true)}
        routePath={routePath}
        routeRetryNonce={routeRetryNonce}
        walletSession={walletSession}
      />
    </>
  );
}
