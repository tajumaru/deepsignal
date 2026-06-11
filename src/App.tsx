import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { InitialBootReady, useBootOverlay } from "./bootstrap/useBootOverlay";
import { BuildUpdateBanner } from "./components/system/BuildUpdateBanner";
import {
  getMixedBuildStatus,
  recordBuildAsset,
  recoverFromMixedBuildAssets,
} from "./lib/buildAssetDiagnostics";
import { warmDashboardRouteEntry } from "./lib/dashboardRouteWarmup";
import { isDashboardWorkspaceReady, useDashboardProjectRestore, useDashboardProjectRestoreSnapshot } from "./lib/dashboardProjectRestore";
import { retryLazyImport } from "./lib/lazyRetry";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { scheduleIdleTask } from "./lib/scheduleIdleTask";
import { DashboardFallbackShell } from "./components/DashboardFallbackShell";
import { LandingPage } from "./pages/LandingPage";
import { AppRoutes } from "./routes/AppRoutes";
import { createAppRouteComponents, type AppRouteComponents } from "./routes/appRouteComponents";
import { useWalletProviderRuntime } from "./components/WalletSurfaceRuntime";
import {
  DelayedWorkspaceRestoreFallback,
  ProviderReadinessBarrier,
} from "./routes/ProviderReadinessBarrier";
import { PublicAppRoutes } from "./routes/PublicAppRoutes";
import { createPublicRouteComponents, type PublicRouteComponents } from "./routes/publicRouteComponents";
import { MixedBuildRecoveryScreen, RouteErrorBoundary } from "./routes/RouteErrorBoundary";
import { ensureCurrentRouteEpoch } from "./routes/routeEpoch";
import { getRouteId } from "./routes/routeDiagnostics";
import {
  getRouteRuntimeMetadata,
  isPublicRoutePath,
  POLICY_IDS,
} from "./routes/routeRuntimePolicy";

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
  // Speculative warming should stay quiet. Real route entry still uses retryLazyImport.
  void import("./pages/ExploreSignalsPage").catch(() => undefined);
}

function prefetchInboxWorkspaceRoute() {
  warmDashboardRouteEntry("idle-prefetch");
}

function shouldPrefetchAdminWorkspace(pathname: string) {
  if (typeof window === "undefined") {
    return false;
  }
  const capabilities = getBrowserCapabilitiesSnapshot();
  const mobileSafari = Boolean(capabilities.mobileSafari);
  const isDesktopViewport = window.matchMedia?.("(min-width: 901px)").matches ?? true;
  const routeMetadata = getRouteRuntimeMetadata(pathname);
  const routeBlocksPrefetch =
    routeMetadata.policyId === POLICY_IDS.CREATE ||
    routeMetadata.policyId === POLICY_IDS.CREATE_COMPOSE ||
    routeMetadata.policyId === POLICY_IDS.DASHBOARD ||
    routeMetadata.publicRoute;
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

function AppRouteRuntimeEffects({
  enabled,
  suppressAutomaticPendingSync = false,
  isDashboardRoot,
}: {
  enabled: boolean;
  suppressAutomaticPendingSync?: boolean;
  isDashboardRoot: boolean;
}) {
  const dashboardProjectRestore = useDashboardProjectRestoreSnapshot();
  const dashboardShellRoute = isDashboardRoot;

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
    if (!enabled || suppressAutomaticPendingSync) {
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
  }, [enabled, suppressAutomaticPendingSync]);

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
  routeNeedsWorkspaceBoot,
  routeWalletUiEnabled,
  routeWalletUiRequested,
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
  routeNeedsWorkspaceBoot: boolean;
  routeWalletUiEnabled: boolean;
  routeWalletUiRequested: boolean;
  routeIsDashboardShell: boolean;
  routePath: string;
  routeRetryNonce: number;
  workspaceReady: boolean;
}) {
  const shellFallback =
    routeIsDashboardShell ? (
      <RouteReady routePath={routePath} onReady={onRouteReady} workspaceReady={false}>
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
        <AppShell
          walletUiEnabled={routeWalletUiEnabled}
          walletUiRequested={routeWalletUiRequested}
          chrome="full"
        >
          <BuildUpdateBanner />
          <AppRouteRuntimeEffects
            enabled={routeNeedsWorkspaceBoot}
            suppressAutomaticPendingSync={routeIsDashboardShell}
            isDashboardRoot={routeIsDashboardShell}
          />
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
  const walletRuntime = useWalletProviderRuntime();
  const routePath = `${location.pathname}${location.search}${location.hash}`;
  const routeMetadata = getRouteRuntimeMetadata(routePath);
  const routeIsLanding = routeMetadata.policyId === POLICY_IDS.LANDING;
  const routeUsesPublicChrome = isPublicRoutePath(routePath);
  const [initialRouteReady, setInitialRouteReady] = useState(false);
  const [bootDismissed, setBootDismissed] = useState(false);
  const [mixedBuildStatus, setMixedBuildStatus] = useState(() => getMixedBuildStatus());
  const [routeRetryNonce, setRouteRetryNonce] = useState(0);
  const appRouteComponents = useMemo(() => createAppRouteComponents(routeRetryNonce), [routeRetryNonce]);
  const publicRouteComponents = useMemo(() => createPublicRouteComponents(routeRetryNonce), [routeRetryNonce]);
  const routeShowsWalletUi = routeMetadata.showWalletUi;
  const routeWalletUiEnabled = walletRuntime.contextAvailable;
  const routeWalletUiRequested = routeShowsWalletUi;
  const routeRequiresWallet = routeMetadata.requiresWallet;
  const routeIsDashboardRoot = routeMetadata.isDashboardRoot;
  const routeNeedsWorkspaceBoot = routeMetadata.initialBlockingMode !== "none";
  ensureCurrentRouteEpoch(routePath);
  const dashboardProjectRestore = useDashboardProjectRestore(routePath, routeIsDashboardRoot);
  const workspaceReadyForRoute = routeIsDashboardRoot ? isDashboardWorkspaceReady(dashboardProjectRestore) : true;

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
      walletSurface: routeWalletUiRequested,
      publicChrome: routeUsesPublicChrome,
      policyId: routeMetadata.policyId,
      walletContextReady: walletRuntime.contextAvailable,
      routeRequiresWallet,
      walletUiRequested: routeWalletUiRequested,
      walletUiEnabled: routeWalletUiEnabled,
    });
    return () => {
      logRouteLifecycle("route:leave", {
        routePath: `${location.pathname}${location.search}${location.hash}`,
      });
    };
  }, [
    location.hash,
    location.pathname,
    location.search,
    routeWalletUiRequested,
    routeUsesPublicChrome,
    routeMetadata.policyId,
    routeRequiresWallet,
    routeWalletUiEnabled,
    walletRuntime.contextAvailable,
  ]);

  useEffect(() => {
    setDeepSignalDebugReadiness({
      workspaceReady: workspaceReadyForRoute,
    });
  }, [workspaceReadyForRoute]);

  useEffect(() => {
    if (routeMetadata.policyId !== POLICY_IDS.LANDING) {
      return undefined;
    }
    return scheduleIdleTask(() => prefetchExploreRoute(), 3500);
  }, [routeMetadata.policyId]);

  useEffect(() => {
    if (routeUsesPublicChrome || !shouldPrefetchAdminWorkspace(routePath)) {
      return undefined;
    }
    const prefetchDelay = routeMetadata.policyId === POLICY_IDS.LANDING ? 1400 : 900;
    return scheduleIdleTask(() => prefetchInboxWorkspaceRoute(), prefetchDelay);
  }, [routeMetadata.policyId, routePath, routeUsesPublicChrome]);

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
      routeNeedsWorkspaceBoot={routeNeedsWorkspaceBoot}
      routeWalletUiEnabled={routeWalletUiEnabled}
      routeWalletUiRequested={routeWalletUiRequested}
      routeIsDashboardShell={routeIsDashboardRoot}
      routePath={routePath}
      routeRetryNonce={routeRetryNonce}
      workspaceReady={workspaceReadyForRoute}
    />
  );
}
