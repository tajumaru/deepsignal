import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { WalletSurface } from "./components/WalletSurface";
import { WalrusRuntimeSurface } from "./components/WalrusRuntimeSurface";
import { isChunkLoadFailure, recoverFromChunkLoadFailure } from "./lib/chunkLoadRecovery";
import { retryLazyImport } from "./lib/lazyRetry";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import { LandingPage } from "./pages/LandingPage";
import { PublicFormPage } from "./pages/PublicFormPage";
import { ZkLoginCallbackPage } from "./pages/ZkLoginCallbackPage";

const AccessManagementPage = lazy(() =>
  retryLazyImport(() => import("./pages/AccessManagementPage")).then((module) => ({
    default: module.AccessManagementPage,
  })),
);
const AdminDashboardPage = lazy(() =>
  retryLazyImport(() => import("./pages/AdminDashboardPage")).then((module) => ({
    default: module.AdminDashboardPage,
  })),
);
const FormBuilderPage = lazy(() =>
  retryLazyImport(() => import("./pages/FormBuilderPage")).then((module) => ({
    default: module.FormBuilderPage,
  })),
);
const ManifestRestorePage = lazy(() =>
  retryLazyImport(() => import("./pages/ManifestRestorePage")).then((module) => ({
    default: module.ManifestRestorePage,
  })),
);
const FormSubmissionsPage = lazy(() =>
  retryLazyImport(() => import("./pages/FormSubmissionsPage")).then((module) => ({
    default: module.FormSubmissionsPage,
  })),
);
const PublicRoadmapPage = lazy(() =>
  retryLazyImport(() => import("./pages/PublicRoadmapPage")).then((module) => ({
    default: module.PublicRoadmapPage,
  })),
);
const SubmissionDetailPage = lazy(() =>
  retryLazyImport(() => import("./pages/SubmissionDetailPage")).then((module) => ({
    default: module.SubmissionDetailPage,
  })),
);
const ExploreSignalsPage = lazy(() =>
  retryLazyImport(() => import("./pages/ExploreSignalsPage")).then((module) => ({
    default: module.ExploreSignalsPage,
  })),
);
const TroubleshootingPage = lazy(() =>
  retryLazyImport(() => import("./pages/TroubleshootingPage")).then((module) => ({
    default: module.TroubleshootingPage,
  })),
);

function WithWalrusRuntime({ children }: { children: ReactNode }) {
  if (REQUIRE_GLOBAL_WALRUS_RUNTIME) {
    return <>{children}</>;
  }
  return <WalrusRuntimeSurface>{children}</WalrusRuntimeSurface>;
}

function RouteFallback() {
  return (
    <div className="panel glow-panel route-status-panel" role="status">
      <p className="eyebrow">Signal surface</p>
      <h1>Loading workspace...</h1>
      <p className="muted">Restoring the Explore surface and local fallback data.</p>
    </div>
  );
}

class RouteErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("DeepSignal route failed to render.", error);
    recoverFromChunkLoadFailure(error);
  }

  componentDidUpdate(prevProps: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleRetry = () => {
    const { error } = this.state;
    if (error && isChunkLoadFailure(error)) {
      recoverFromChunkLoadFailure(error);
      window.location.reload();
      return;
    }

    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      const chunkFailure = isChunkLoadFailure(this.state.error);

      return (
        <div className="panel glow-panel route-status-panel" role="alert">
          <p className="eyebrow">Signal surface</p>
          <h1>{chunkFailure ? "Explore could not open cleanly." : "Explore hit an unexpected fault."}</h1>
          <p className="muted">
            {chunkFailure
              ? "Refresh the page to retry the current chunk. Local fallback data is still preserved."
              : "Retry the route to restore the workspace. Local fallback data is still preserved."}
          </p>
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={this.handleRetry}>
              {chunkFailure ? "Retry chunk" : "Retry route"}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

declare global {
  interface Window {
    __DEEPSIGNAL_BOOT_STARTED_AT__?: number;
  }
}

const BOOT_MIN_VISIBLE_MS = 1250;
const BOOT_EXIT_DURATION_MS = 380;
const BOOT_FAILSAFE_MS = 2500;

function InitialBootReady({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const routeUsesPublicChrome =
    location.pathname.startsWith("/f/") ||
    location.pathname.startsWith("/roadmap/") ||
    location.pathname.startsWith("/m/") ||
    location.pathname.startsWith("/auth/zklogin/");
  const [initialRouteReady, setInitialRouteReady] = useState(false);
  const [bootDismissed, setBootDismissed] = useState(false);

  const dismissBootOverlay = useCallback(() => {
    document.getElementById("boot-overlay")?.remove();
    document.body.classList.remove("booting");
    setBootDismissed(true);
  }, []);

  useEffect(() => {
    const failsafe = window.setTimeout(dismissBootOverlay, BOOT_FAILSAFE_MS);

    return () => window.clearTimeout(failsafe);
  }, [dismissBootOverlay]);

  useEffect(() => {
    if (!initialRouteReady || bootDismissed) {
      return undefined;
    }

    const bootOverlay = document.getElementById("boot-overlay");
    const bootStatus = document.querySelector<HTMLElement>("[data-boot-status]");
    if (!bootOverlay) {
      dismissBootOverlay();
      return undefined;
    }

    const startedAt = window.__DEEPSIGNAL_BOOT_STARTED_AT__ ?? performance.now();
    const elapsed = performance.now() - startedAt;
    const delay = Math.max(0, BOOT_MIN_VISIBLE_MS - elapsed);
    let exitTimer = 0;

    const finalize = window.setTimeout(() => {
      if (bootStatus) {
        bootStatus.textContent = "Opening encrypted signal workspace...";
      }
      bootOverlay.setAttribute("data-state", "exiting");

      exitTimer = window.setTimeout(() => {
        dismissBootOverlay();
      }, BOOT_EXIT_DURATION_MS);
    }, delay);

    return () => {
      window.clearTimeout(finalize);
      window.clearTimeout(exitTimer);
    };
  }, [bootDismissed, dismissBootOverlay, initialRouteReady]);

  const routeSurface = (
    <AppShell walletAvailable chrome={routeUsesPublicChrome ? "public" : "full"}>
      <RouteErrorBoundary resetKey={location.key}>
        <Suspense fallback={<RouteFallback />}>
          <InitialBootReady onReady={() => setInitialRouteReady(true)}>
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
              <Route
                path="/admin/forms/new"
                element={
                  <WithWalrusRuntime>
                    <FormBuilderPage />
                  </WithWalrusRuntime>
                }
              />
              <Route
                path="/admin/forms/:formId"
                element={
                  <WithWalrusRuntime>
                    <FormSubmissionsPage />
                  </WithWalrusRuntime>
                }
              />
              <Route
                path="/dashboard/forms/:formId"
                element={
                  <WithWalrusRuntime>
                    <FormSubmissionsPage />
                  </WithWalrusRuntime>
                }
              />
              <Route
                path="/admin/forms/:formId/submissions/:submissionId"
                element={
                  <WithWalrusRuntime>
                    <FormSubmissionsPage />
                  </WithWalrusRuntime>
                }
              />
              <Route
                path="/dashboard/forms/:formId/submissions/:submissionId"
                element={
                  <WithWalrusRuntime>
                    <FormSubmissionsPage />
                  </WithWalrusRuntime>
                }
              />
              <Route path="/admin/submissions/:submissionId" element={<SubmissionDetailPage />} />
              <Route path="/f/:formId" element={<PublicFormPage />} />
              <Route path="/roadmap/:formId" element={<PublicRoadmapPage />} />
              <Route path="/m/:manifestBlobId" element={<ManifestRestorePage />} />
              <Route path="/auth/zklogin/callback" element={<ZkLoginCallbackPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </InitialBootReady>
        </Suspense>
      </RouteErrorBoundary>
    </AppShell>
  );

  return (
    <WalletSurface
      fallback={
        <InitialBootReady onReady={() => setInitialRouteReady(true)}>
          <AppShell walletAvailable={false} chrome={routeUsesPublicChrome ? "public" : "full"}>
            <RouteFallback />
          </AppShell>
        </InitialBootReady>
      }
    >
      {routeSurface}
    </WalletSurface>
  );
}
