import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppBootRuntime, WorkspaceRouteRuntimeEffects } from "../AppBootRuntime";
import { InitialBootReady, useBootOverlay } from "../bootstrap/useBootOverlay";
import { DashboardFallbackShell } from "../components/DashboardFallbackShell";
import { BuildUpdateBanner } from "../components/system/BuildUpdateBanner";
import { getMixedBuildStatus, recordBuildAsset, recoverFromMixedBuildAssets } from "../lib/buildAssetDiagnostics";
import {
  isDashboardBootPending,
  isDashboardWalletRuntimeSettled,
  isDashboardWorkspaceReady,
  useDashboardProjectRestore,
  useDashboardProjectRestoreSnapshot,
} from "../lib/dashboardProjectRestore";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { AppRoutes } from "../routes/AppRoutes";
import { appRouteComponents } from "../routes/appRouteComponents";
import { DelayedWorkspaceRestoreFallback, ProviderReadinessBarrier } from "../routes/ProviderReadinessBarrier";
import { MixedBuildRecoveryScreen, RouteErrorBoundary } from "../routes/RouteErrorBoundary";
import { useCurrentRouteEpoch } from "../routes/routeEpoch";
import { getRouteId } from "../routes/routeDiagnostics";
import { WalletRequiredGate } from "../routes/WalletRequiredGate";
import { getRouteRuntimeMetadata, requiresWorkspaceBoot, shouldShowWalletUi } from "../routes/routeRuntimePolicy";
import { getWalletRouteGateStatus } from "../routes/walletRouteGateStatus";
import { useWalletSessionState } from "../walletSessionState";
import { AppShell } from "../components/AppShell";

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

function PrivateRouteSurface({
  locationKey,
  mixedBuildStatus,
  onRetryRoute,
  onRouteReady,
  routePath,
  routeRetryNonce,
}: {
  locationKey: string;
  mixedBuildStatus: ReturnType<typeof getMixedBuildStatus>;
  onRetryRoute: () => void;
  onRouteReady: () => void;
  routePath: string;
  routeRetryNonce: number;
}) {
  const location = useLocation();
  const walletSession = useWalletSessionState();
  const routeMetadata = getRouteRuntimeMetadata(location.pathname);
  const routeShowsWalletUi = shouldShowWalletUi(location.pathname);
  const routeNeedsWorkspaceBoot = requiresWorkspaceBoot(location.pathname);
  const routeIsDashboardShell = location.pathname === "/dashboard";
  const routeEpoch = useCurrentRouteEpoch(routePath);
  const walletGateStatus = getWalletRouteGateStatus(routeMetadata.walletRequired, walletSession);
  const routeWalletGateStatus = routeIsDashboardShell ? "allowed" : walletGateStatus;
  const routeReady = routeWalletGateStatus === "allowed";
  const dashboardProjectRestoreSnapshot = useDashboardProjectRestoreSnapshot();
  const dashboardWalletSettled = isDashboardWalletRuntimeSettled(dashboardProjectRestoreSnapshot.walletRuntime);
  const dashboardRestoreEnabled = routeIsDashboardShell;
  const dashboardProjectRestore = useDashboardProjectRestore(routePath, dashboardRestoreEnabled, false);
  const dashboardBootPending = isDashboardBootPending(dashboardProjectRestore, {
    walletProviderMounted: walletSession.providerMounted,
    walletProviderPending: walletSession.providerLoading || !walletSession.providerMounted,
    walletSessionPhase: walletSession.phase,
  });
  const workspaceReady = routeIsDashboardShell
    ? !dashboardBootPending && isDashboardWorkspaceReady(dashboardProjectRestore)
    : routeReady;
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
    <>
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
          routeUsesPublicChrome={false}
          walletProviderLoading={walletSession.providerLoading}
          walletProviderMounted={walletSession.providerMounted}
          walletRequiredGateStatus={routeWalletGateStatus}
          walletSessionPhase={walletSession.phase}
          workspaceReadyForRoute={workspaceReady}
        />
      </Suspense>
      <RouteErrorBoundary
        resetKey={`${locationKey}:${routeRetryNonce}:shell`}
        routePath={routePath}
        onRetryRoute={onRetryRoute}
      >
        <Suspense fallback={shellFallback}>
          <AppShell
            passiveHeaderWallet={
              location.pathname === "/dashboard" &&
              dashboardProjectRestoreSnapshot.state === "ready_without_project" &&
              dashboardProjectRestoreSnapshot.currentProjectId === ""
            }
            walletProviderMounted={walletSession.providerMounted}
            walletProviderPending={walletSession.providerLoading || !walletSession.providerMounted}
            walletSessionPhase={walletSession.phase}
            routeReady={routeReady}
            walletUiEnabled={
              routeReady &&
              routeShowsWalletUi
            }
            walletUiRequested={routeShowsWalletUi}
            chrome="full"
          >
            <BuildUpdateBanner />
            <Suspense fallback={null}>
              <WorkspaceRouteRuntimeEffects
                blockedWalletRequired={!routeIsDashboardShell && routeMetadata.walletRequired && walletGateStatus === "disconnected"}
                enabled={routeNeedsWorkspaceBoot && (!routeMetadata.walletRequired || routeReady || routeIsDashboardShell)}
                routePath={routePath}
                suppressAutomaticPendingSync={routeIsDashboardShell}
              />
            </Suspense>
            {mixedBuildStatus.detected ? (
              <RouteReady routePath={routePath} onReady={onRouteReady}>
                <MixedBuildRecoveryScreen observed={mixedBuildStatus.observed} />
              </RouteReady>
            ) : (
              <Suspense fallback={<DelayedWorkspaceRestoreFallback />}>
                <RouteReady routePath={routePath} onReady={onRouteReady} workspaceReady={workspaceReady}>
                  <WalletRequiredGate
                    walletRequired={routeIsDashboardShell ? false : routeMetadata.walletRequired}
                    walletSession={walletSession}
                  >
                    <ProviderReadinessBarrier routePath={routePath} enabled={routeNeedsWorkspaceBoot}>
                      <AppRoutes
                        components={appRouteComponents}
                        onRetryRoute={onRetryRoute}
                        routeEpoch={routeEpoch.routeEpoch}
                        routeRetryNonce={routeRetryNonce}
                      />
                    </ProviderReadinessBarrier>
                  </WalletRequiredGate>
                </RouteReady>
              </Suspense>
            )}
          </AppShell>
        </Suspense>
      </RouteErrorBoundary>
    </>
  );
}

export function WorkspaceSurface() {
  const location = useLocation();
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
    <PrivateRouteSurface
      locationKey={location.key}
      mixedBuildStatus={mixedBuildStatus}
      onRetryRoute={() => setRouteRetryNonce((value) => value + 1)}
      onRouteReady={() => setInitialRouteReady(true)}
      routePath={routePath}
      routeRetryNonce={routeRetryNonce}
    />
  );
}
