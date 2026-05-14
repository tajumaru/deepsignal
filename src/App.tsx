import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { WalrusRuntimeSurface } from "./components/WalrusRuntimeSurface";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import { LandingPage } from "./pages/LandingPage";

const AccessManagementPage = lazy(() =>
  import("./pages/AccessManagementPage").then((module) => ({
    default: module.AccessManagementPage,
  })),
);
const AdminDashboardPage = lazy(() =>
  import("./pages/AdminDashboardPage").then((module) => ({
    default: module.AdminDashboardPage,
  })),
);
const FormBuilderPage = lazy(() =>
  import("./pages/FormBuilderPage").then((module) => ({
    default: module.FormBuilderPage,
  })),
);
const ManifestRestorePage = lazy(() =>
  import("./pages/ManifestRestorePage").then((module) => ({
    default: module.ManifestRestorePage,
  })),
);
const FormSubmissionsPage = lazy(() =>
  import("./pages/FormSubmissionsPage").then((module) => ({
    default: module.FormSubmissionsPage,
  })),
);
const PublicFormPage = lazy(() =>
  import("./pages/PublicFormPage").then((module) => ({
    default: module.PublicFormPage,
  })),
);
const PublicRoadmapPage = lazy(() =>
  import("./pages/PublicRoadmapPage").then((module) => ({
    default: module.PublicRoadmapPage,
  })),
);
const SubmissionDetailPage = lazy(() =>
  import("./pages/SubmissionDetailPage").then((module) => ({
    default: module.SubmissionDetailPage,
  })),
);
const ExploreSignalsPage = lazy(() =>
  import("./pages/ExploreSignalsPage").then((module) => ({
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
        setBootDismissed(true);
      }, exitDurationMs);
    }, delay);

    return () => {
      window.clearTimeout(finalize);
      window.clearTimeout(exitTimer);
    };
  }, [bootDismissed, initialRouteReady]);

  return (
    <AppShell>
      <Suspense fallback={bootDismissed ? <RouteFallback /> : null}>
        <InitialBootReady onReady={() => setInitialRouteReady(true)}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/explore" element={<ExploreSignalsPage />} />
            <Route path="/signals" element={<Navigate to="/explore" replace />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </InitialBootReady>
      </Suspense>
    </AppShell>
  );
}
