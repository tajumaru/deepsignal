import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { InitialBootReady, useBootOverlay } from "./bootstrap/useBootOverlay";
import { BuildUpdateBanner } from "./components/system/BuildUpdateBanner";
import { WalletSurface } from "./components/WalletSurface";
import {
  getMixedBuildStatus,
  recordBuildAsset,
  recoverFromMixedBuildAssets,
} from "./lib/buildAssetDiagnostics";
import { retryLazyImport } from "./lib/lazyRetry";
import { logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { scheduleIdleTask } from "./lib/scheduleIdleTask";
import { RpcInfrastructureProvider } from "./RpcInfrastructureProvider";
import { AppRoutes } from "./routes/AppRoutes";
import { createAppRouteComponents, type AppRouteComponents } from "./routes/appRouteComponents";
import { ProviderReadinessBarrier, WorkspaceRestoreFallback } from "./routes/ProviderReadinessBarrier";
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

function RouteReady({
  children,
  routePath,
  onReady,
}: {
  children: ReactNode;
  routePath: string;
  onReady: () => void;
}) {
  return (
    <InitialBootReady routePath={routePath} onReady={onReady}>
      {children}
    </InitialBootReady>
  );
}

function AppRouteRuntimeEffects({ enabled }: { enabled: boolean }) {
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
        setDeepSignalDebugReadiness({
          routeProviderGuard: "ready",
          workspaceProjectProvider: projectRegistry.getSelectedProjectId() ? "selected" : "empty",
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
  }, [enabled]);

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
          <Suspense fallback={<WorkspaceRestoreFallback />}>
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
  routeNeedsWalletSurface,
  routeNeedsWorkspaceBoot,
  routePath,
  routeRetryNonce,
}: {
  components: AppRouteComponents;
  locationKey: string;
  mixedBuildStatus: ReturnType<typeof getMixedBuildStatus>;
  onRetryRoute: () => void;
  onRouteReady: () => void;
  routeNeedsWalletSurface: boolean;
  routeNeedsWorkspaceBoot: boolean;
  routePath: string;
  routeRetryNonce: number;
}) {
  return (
    <Suspense fallback={<WorkspaceRestoreFallback />}>
      <AppShell walletAvailable={routeNeedsWalletSurface} chrome="full">
        <BuildUpdateBanner />
        <AppRouteRuntimeEffects enabled={routeNeedsWorkspaceBoot} />
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
            <Suspense fallback={<WorkspaceRestoreFallback />}>
              <RouteReady routePath={routePath} onReady={onRouteReady}>
                <ProviderReadinessBarrier routePath={routePath} enabled={routeNeedsWorkspaceBoot}>
                  <AppRoutes components={components} />
                </ProviderReadinessBarrier>
              </RouteReady>
            </Suspense>
          )}
        </RouteErrorBoundary>
      </AppShell>
    </Suspense>
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
  const { LandingPage } = appRouteComponents;
  const routeNeedsWalletSurface =
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
      walletSurface: routeNeedsWalletSurface,
      publicChrome: routeUsesPublicChrome,
    });
    return () => {
      logRouteLifecycle("route:leave", {
        routePath: `${location.pathname}${location.search}${location.hash}`,
      });
    };
  }, [location.hash, location.pathname, location.search, routeNeedsWalletSurface, routeUsesPublicChrome]);

  useEffect(() => {
    if (location.pathname !== "/") {
      return undefined;
    }
    return scheduleIdleTask(() => prefetchExploreRoute(), 3500);
  }, [location.pathname]);

  const routePath = `${location.pathname}${location.search}${location.hash}`;

  if (routeIsLanding) {
    return (
      <RpcInfrastructureProvider>
        <Suspense fallback={<WorkspaceRestoreFallback />}>
          <AppShell walletAvailable={false} chrome="full">
            <BuildUpdateBanner />
            <RouteReady routePath={routePath} onReady={() => setInitialRouteReady(true)}>
              <LandingPage />
            </RouteReady>
          </AppShell>
        </Suspense>
      </RpcInfrastructureProvider>
    );
  }

  if (routeUsesPublicChrome) {
    return (
      <RpcInfrastructureProvider>
        <Suspense fallback={<WorkspaceRestoreFallback />}>
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
      </RpcInfrastructureProvider>
    );
  }

  const routeSurface = (
    <PrivateRouteSurface
      components={appRouteComponents}
      locationKey={location.key}
      mixedBuildStatus={mixedBuildStatus}
      onRetryRoute={() => setRouteRetryNonce((value) => value + 1)}
      onRouteReady={() => setInitialRouteReady(true)}
      routeNeedsWalletSurface={routeNeedsWalletSurface}
      routeNeedsWorkspaceBoot={routeNeedsWorkspaceBoot}
      routePath={routePath}
      routeRetryNonce={routeRetryNonce}
    />
  );

  if (!routeNeedsWalletSurface) {
    return <RpcInfrastructureProvider>{routeSurface}</RpcInfrastructureProvider>;
  }

  return (
    <RpcInfrastructureProvider>
      <WalletSurface
        fallback={
          <Suspense fallback={<WorkspaceRestoreFallback />}>
            <RouteReady routePath={routePath} onReady={() => setInitialRouteReady(true)}>
              <AppShell walletAvailable={false} chrome="full">
                <BuildUpdateBanner />
                <WorkspaceRestoreFallback onRetry={() => window.location.reload()} />
              </AppShell>
            </RouteReady>
          </Suspense>
        }
      >
        {routeSurface}
      </WalletSurface>
    </RpcInfrastructureProvider>
  );
}
