import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { InitialBootReady, useBootOverlay } from "./bootstrap/useBootOverlay";
import { AppShell } from "./components/AppShell";
import { WalletSurface } from "./components/WalletSurface";
import { WalrusRuntimeSurface } from "./components/WalrusRuntimeSurface";
import {
  getMixedBuildStatus,
  recordBuildAsset,
  recoverFromMixedBuildAssets,
} from "./lib/buildAssetDiagnostics";
import {
  subscribeToBuildUpdateNotices,
  updateDeepSignalToLatest,
  type BuildUpdateNotice,
} from "./lib/buildUpdate";
import { retryLazyImport } from "./lib/lazyRetry";
import { logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import { scheduleIdleTask } from "./lib/scheduleIdleTask";
import { LandingPage } from "./pages/LandingPage";
import { RpcInfrastructureProvider } from "./RpcInfrastructureProvider";
import { ProviderReadinessBarrier, WorkspaceRestoreFallback } from "./routes/ProviderReadinessBarrier";
import { MixedBuildRecoveryScreen, RouteErrorBoundary } from "./routes/RouteErrorBoundary";
import { getRouteId } from "./routes/routeDiagnostics";

function createRouteComponents(retryNonce = 0) {
  void retryNonce;
  return {
    AccessManagementPage: lazy(() =>
      retryLazyImport(() => import("./pages/AccessManagementPage"), "route-access-management").then((module) => ({
        default: module.AccessManagementPage,
      })),
    ),
    AdminDashboardPage: lazy(() =>
      retryLazyImport(() => import("./pages/AdminDashboardPage"), "route-admin-dashboard").then((module) => ({
        default: module.AdminDashboardPage,
      })),
    ),
    FormBuilderPage: lazy(() =>
      retryLazyImport(() => import("./pages/FormBuilderPage"), "route-form-builder").then((module) => ({
        default: module.FormBuilderPage,
      })),
    ),
    ManifestRestorePage: lazy(() =>
      retryLazyImport(() => import("./pages/ManifestRestorePage"), "route-manifest-restore").then((module) => ({
        default: module.ManifestRestorePage,
      })),
    ),
    PublicRoadmapPage: lazy(() =>
      retryLazyImport(() => import("./pages/PublicRoadmapPage"), "route-public-roadmap").then((module) => ({
        default: module.PublicRoadmapPage,
      })),
    ),
    SubmissionDetailPage: lazy(() =>
      retryLazyImport(() => import("./pages/SubmissionDetailPage"), "route-submission-detail").then((module) => ({
        default: module.SubmissionDetailPage,
      })),
    ),
    SubmittedHistoryPage: lazy(() =>
      retryLazyImport(() => import("./pages/SubmittedHistoryPage"), "route-submitted-history").then((module) => ({
        default: module.SubmittedHistoryPage,
      })),
    ),
    MyResponsesPage: lazy(() =>
      retryLazyImport(() => import("./pages/MyResponsesPage"), "route-my-responses").then((module) => ({
        default: module.MyResponsesPage,
      })),
    ),
    ExploreSignalsPage: lazy(() =>
      retryLazyImport(() => import("./pages/ExploreSignalsPage"), "route-explore").then((module) => ({
        default: module.ExploreSignalsPage,
      })),
    ),
    TroubleshootingPage: lazy(() =>
      retryLazyImport(() => import("./pages/TroubleshootingPage"), "route-troubleshooting").then((module) => ({
        default: module.TroubleshootingPage,
      })),
    ),
    InsightsFixturePage: lazy(() =>
      retryLazyImport(() => import("./pages/InsightsFixturePage"), "route-insights-fixture").then((module) => ({
        default: module.InsightsFixturePage,
      })),
    ),
    PublicFormPage: lazy(() =>
      retryLazyImport(() => import("./pages/PublicFormPage"), "route-public-form").then((module) => ({
        default: module.PublicFormPage,
      })),
    ),
    ZkLoginCallbackPage: lazy(() =>
      retryLazyImport(() => import("./pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) => ({
        default: module.ZkLoginCallbackPage,
      })),
    ),
  };
}

function LegacyFormInboxRedirect({ basePath }: { basePath: "/admin" | "/dashboard" }) {
  const { formId = "", submissionId = "" } = useParams();
  const params = new URLSearchParams({ tab: "review" });
  if (formId) {
    params.set("form", formId);
  }
  if (submissionId) {
    params.set("signal", submissionId);
  }
  return <Navigate to={`${basePath}?${params.toString()}`} replace />;
}

function prefetchExploreRoute() {
  void retryLazyImport(() => import("./pages/ExploreSignalsPage"), "prefetch-route-explore").catch(() => undefined);
}

function WithWalrusRuntime({ children }: { children: ReactNode }) {
  if (REQUIRE_GLOBAL_WALRUS_RUNTIME) {
    return <>{children}</>;
  }
  return <WalrusRuntimeSurface>{children}</WalrusRuntimeSurface>;
}

function BuildUpdateBanner() {
  const [notice, setNotice] = useState<BuildUpdateNotice | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => subscribeToBuildUpdateNotices(setNotice), []);

  if (!notice) {
    return null;
  }

  async function handleUpdate() {
    if (!notice) {
      return;
    }
    setUpdating(true);
    try {
      await updateDeepSignalToLatest(notice);
    } catch (error) {
      setUpdating(false);
      console.warn("[DeepSignal update] update action failed", error);
    }
  }

  return (
    <aside className="build-update-banner" role="status" aria-live="polite">
      <div>
        <strong>New version available</strong>
        <p>DeepSignal has been updated. Load the latest version.</p>
      </div>
      <button type="button" className="primary-button" onClick={() => void handleUpdate()} disabled={updating}>
        {updating ? "Updating..." : "Update DeepSignal"}
      </button>
    </aside>
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
  const {
    AccessManagementPage,
    AdminDashboardPage,
    FormBuilderPage,
    ManifestRestorePage,
    PublicRoadmapPage,
    SubmissionDetailPage,
    SubmittedHistoryPage,
    MyResponsesPage,
    ExploreSignalsPage,
    TroubleshootingPage,
    InsightsFixturePage,
    PublicFormPage,
    ZkLoginCallbackPage,
  } = useMemo(() => createRouteComponents(routeRetryNonce), [routeRetryNonce]);
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

  if (routeIsLanding) {
    return (
      <RpcInfrastructureProvider>
        <AppShell walletAvailable={false} chrome="full">
          <BuildUpdateBanner />
          <InitialBootReady routePath={`${location.pathname}${location.search}${location.hash}`} onReady={() => setInitialRouteReady(true)}>
            <LandingPage />
          </InitialBootReady>
        </AppShell>
      </RpcInfrastructureProvider>
    );
  }

  const routeSurface = (
    <AppShell walletAvailable={routeNeedsWalletSurface} chrome={routeUsesPublicChrome ? "public" : "full"}>
      <BuildUpdateBanner />
      <AppRouteRuntimeEffects enabled={routeNeedsWorkspaceBoot} />
      <RouteErrorBoundary
        resetKey={`${location.key}:${routeRetryNonce}`}
        routePath={`${location.pathname}${location.search}${location.hash}`}
        onRetryRoute={() => setRouteRetryNonce((value) => value + 1)}
      >
        {mixedBuildStatus.detected ? (
          <InitialBootReady routePath={`${location.pathname}${location.search}${location.hash}`} onReady={() => setInitialRouteReady(true)}>
            <MixedBuildRecoveryScreen observed={mixedBuildStatus.observed} />
          </InitialBootReady>
        ) : (
          <Suspense fallback={<WorkspaceRestoreFallback />}>
            <InitialBootReady routePath={`${location.pathname}${location.search}${location.hash}`} onReady={() => setInitialRouteReady(true)}>
              <ProviderReadinessBarrier routePath={`${location.pathname}${location.search}${location.hash}`} enabled={routeNeedsWorkspaceBoot}>
              <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/explore" element={<ExploreSignalsPage />} />
              <Route path="/signals" element={<Navigate to="/explore" replace />} />
              <Route
                path="/create"
                element={
                  <WithWalrusRuntime>
                    <FormBuilderPage />
                  </WithWalrusRuntime>
                }
              />
              <Route
                path="/compose"
                element={
                  <WithWalrusRuntime>
                    <FormBuilderPage />
                  </WithWalrusRuntime>
                }
              />
              <Route
                path="/admin"
                element={
                  <WithWalrusRuntime>
                    <AdminDashboardPage />
                  </WithWalrusRuntime>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <WithWalrusRuntime>
                    <AdminDashboardPage />
                  </WithWalrusRuntime>
                }
              />
              <Route path="/admin/access" element={<AccessManagementPage />} />
              <Route path="/dashboard/access" element={<AccessManagementPage />} />
              <Route path="/troubleshooting" element={<TroubleshootingPage />} />
              <Route path="/dev/insights-fixture" element={<InsightsFixturePage />} />
              <Route
                path="/admin/forms/new"
                element={
                  <WithWalrusRuntime>
                    <FormBuilderPage initialSurface="composer" />
                  </WithWalrusRuntime>
                }
              />
              <Route
                path="/admin/forms/:formId"
                element={<LegacyFormInboxRedirect basePath="/admin" />}
              />
              <Route
                path="/dashboard/forms/:formId"
                element={<LegacyFormInboxRedirect basePath="/dashboard" />}
              />
              <Route
                path="/admin/forms/:formId/submissions/:submissionId"
                element={<LegacyFormInboxRedirect basePath="/admin" />}
              />
              <Route
                path="/dashboard/forms/:formId/submissions/:submissionId"
                element={<LegacyFormInboxRedirect basePath="/dashboard" />}
              />
              <Route path="/admin/submissions/:submissionId" element={<SubmissionDetailPage />} />
              <Route path="/submitted" element={<SubmittedHistoryPage />} />
              <Route path="/submitted/:submissionId" element={<SubmittedHistoryPage />} />
              <Route path="/my-submissions" element={<SubmittedHistoryPage />} />
              <Route path="/my-submissions/:submissionId" element={<SubmittedHistoryPage />} />
              <Route path="/my-responses" element={<MyResponsesPage />} />
              <Route path="/my-responses/:submissionId" element={<MyResponsesPage />} />
              <Route path="/f/:formId" element={<PublicFormPage />} />
              <Route path="/roadmap/:formId" element={<PublicRoadmapPage />} />
              <Route path="/m/:manifestBlobId" element={<ManifestRestorePage />} />
              <Route path="/auth/zklogin/callback" element={<ZkLoginCallbackPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </ProviderReadinessBarrier>
            </InitialBootReady>
          </Suspense>
        )}
      </RouteErrorBoundary>
    </AppShell>
  );

  if (!routeNeedsWalletSurface) {
    return <RpcInfrastructureProvider>{routeSurface}</RpcInfrastructureProvider>;
  }

  return (
    <RpcInfrastructureProvider>
      <WalletSurface
        fallback={
          <InitialBootReady routePath={`${location.pathname}${location.search}${location.hash}`} onReady={() => setInitialRouteReady(true)}>
            <AppShell walletAvailable={false} chrome={routeUsesPublicChrome ? "public" : "full"}>
              <BuildUpdateBanner />
              <WorkspaceRestoreFallback onRetry={() => window.location.reload()} />
            </AppShell>
          </InitialBootReady>
        }
      >
        {routeSurface}
      </WalletSurface>
    </RpcInfrastructureProvider>
  );
}
