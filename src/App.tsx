import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME, WalrusRuntimeProvider } from "./providers";

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
  return <WalrusRuntimeProvider>{children}</WalrusRuntimeProvider>;
}

function RouteFallback() {
  return <div className="panel">Loading workspace...</div>;
}

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
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
          <Route
            path="/f/:formId"
            element={
              <WithWalrusRuntime>
                <PublicFormPage />
              </WithWalrusRuntime>
            }
          />
          <Route path="/roadmap/:formId" element={<PublicRoadmapPage />} />
          <Route path="/m/:manifestBlobId" element={<ManifestRestorePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
