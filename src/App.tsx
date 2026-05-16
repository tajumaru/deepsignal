import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { WalletSurface } from "./components/WalletSurface";
import { WalrusRuntimeSurface } from "./components/WalrusRuntimeSurface";
import { retryLazyImport } from "./lib/lazyRetry";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import { DemoModePage } from "./pages/DemoModePage";
import { LandingPage } from "./pages/LandingPage";
import { PublicFormPage } from "./pages/PublicFormPage";

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

function WithWalrusRuntime({ children }: { children: ReactNode }) {
  if (REQUIRE_GLOBAL_WALRUS_RUNTIME) {
    return <>{children}</>;
  }
  return <WalrusRuntimeSurface>{children}</WalrusRuntimeSurface>;
}

function RouteFallback() {
  return <div className="panel">Loading workspace...</div>;
}

declare global {
  interface Window {
    __DEEPSIGNAL_BOOT_STARTED_AT__?: number;
  }
}

function InitialBootReady({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const demoModeEnabled = location.pathname === "/demo" || new URLSearchParams(location.search).get("demo") === "1";
  const renderLanding = demoModeEnabled && location.pathname === "/" ? <DemoModePage /> : <LandingPage />;
  const routeUsesPublicChrome =
    location.pathname.startsWith("/f/") ||
    location.pathname.startsWith("/roadmap/") ||
    location.pathname.startsWith("/m/");
  const [initialRouteReady, setInitialRouteReady] = useState(false);
  const [bootDismissed, setBootDismissed] = useState(false);

  useEffect(() => {
    if (!initialRouteReady || bootDismissed) {
      return undefined;
    }

    const bootOverlay = document.getElementById("boot-overlay");
    const bootStatus = document.querySelector<HTMLElement>("[data-boot-status]");
    const startedAt = window.__DEEPSIGNAL_BOOT_STARTED_AT__ ?? performance.now();
    const elapsed = performance.now() - startedAt;
    const minVisibleMs = 1450;
    const exitDurationMs = 620;
    const delay = Math.max(0, minVisibleMs - elapsed);
    let exitTimer = 0;

    const finalize = window.setTimeout(() => {
      if (bootStatus) {
        bootStatus.textContent = "Signal link established. Opening command surface...";
      }
      if (bootOverlay) {
        bootOverlay.setAttribute("data-state", "exiting");
      }

      exitTimer = window.setTimeout(() => {
        bootOverlay?.remove();
        document.body.classList.remove("booting");
        setBootDismissed(true);
      }, exitDurationMs);
    }, delay);

    return () => {
      window.clearTimeout(finalize);
      window.clearTimeout(exitTimer);
    };
  }, [bootDismissed, initialRouteReady]);

  return (
    <WalletSurface fallback={null}>
      <AppShell walletAvailable chrome={routeUsesPublicChrome ? "public" : "full"}>
        <Suspense fallback={bootDismissed ? <RouteFallback /> : null}>
          <InitialBootReady onReady={() => setInitialRouteReady(true)}>
            <Routes>
              <Route path="/" element={renderLanding} />
              <Route path="/demo" element={<DemoModePage />} />
              <Route
                path="/explore"
                element={
                  <WalletSurface>
                    <ExploreSignalsPage />
                  </WalletSurface>
                }
              />
              <Route path="/signals" element={<Navigate to="/explore" replace />} />
              <Route
                path="/create"
                element={
                  <WalletSurface>
                    <WithWalrusRuntime>
                      <FormBuilderPage />
                    </WithWalrusRuntime>
                  </WalletSurface>
                }
              />
              <Route
                path="/admin"
                element={
                  <WalletSurface>
                    <WithWalrusRuntime>
                      <AdminDashboardPage />
                    </WithWalrusRuntime>
                  </WalletSurface>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <WalletSurface>
                    <WithWalrusRuntime>
                      <AdminDashboardPage />
                    </WithWalrusRuntime>
                  </WalletSurface>
                }
              />
              <Route
                path="/admin/access"
                element={
                  <WalletSurface>
                    <AccessManagementPage />
                  </WalletSurface>
                }
              />
              <Route
                path="/dashboard/access"
                element={
                  <WalletSurface>
                    <AccessManagementPage />
                  </WalletSurface>
                }
              />
              <Route
                path="/admin/forms/new"
                element={
                  <WalletSurface>
                    <WithWalrusRuntime>
                      <FormBuilderPage />
                    </WithWalrusRuntime>
                  </WalletSurface>
                }
              />
              <Route
                path="/admin/forms/:formId"
                element={
                  <WalletSurface>
                    <WithWalrusRuntime>
                      <FormSubmissionsPage />
                    </WithWalrusRuntime>
                  </WalletSurface>
                }
              />
              <Route
                path="/dashboard/forms/:formId"
                element={
                  <WalletSurface>
                    <WithWalrusRuntime>
                      <FormSubmissionsPage />
                    </WithWalrusRuntime>
                  </WalletSurface>
                }
              />
              <Route
                path="/admin/forms/:formId/submissions/:submissionId"
                element={
                  <WalletSurface>
                    <WithWalrusRuntime>
                      <FormSubmissionsPage />
                    </WithWalrusRuntime>
                  </WalletSurface>
                }
              />
              <Route
                path="/dashboard/forms/:formId/submissions/:submissionId"
                element={
                  <WalletSurface>
                    <WithWalrusRuntime>
                      <FormSubmissionsPage />
                    </WithWalrusRuntime>
                  </WalletSurface>
                }
              />
              <Route
                path="/admin/submissions/:submissionId"
                element={
                  <WalletSurface>
                    <SubmissionDetailPage />
                  </WalletSurface>
                }
              />
              <Route path="/f/:formId" element={<PublicFormPage />} />
              <Route path="/roadmap/:formId" element={<PublicRoadmapPage />} />
              <Route path="/m/:manifestBlobId" element={<ManifestRestorePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </InitialBootReady>
        </Suspense>
        {demoModeEnabled ? <div className="demo-mode-badge">Demo mode</div> : null}
      </AppShell>
    </WalletSurface>
  );
}
