import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { AccessManagementPage } from "./pages/AccessManagementPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { FormBuilderPage } from "./pages/FormBuilderPage";
import { ManifestRestorePage } from "./pages/ManifestRestorePage";
import { FormSubmissionsPage } from "./pages/FormSubmissionsPage";
import { LandingPage } from "./pages/LandingPage";
import { PublicFormPage } from "./pages/PublicFormPage";
import { PublicRoadmapPage } from "./pages/PublicRoadmapPage";
import { SubmissionDetailPage } from "./pages/SubmissionDetailPage";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME, WalrusRuntimeProvider } from "./providers";

function WithWalrusRuntime({ children }: { children: ReactNode }) {
  if (REQUIRE_GLOBAL_WALRUS_RUNTIME) {
    return <>{children}</>;
  }
  return <WalrusRuntimeProvider>{children}</WalrusRuntimeProvider>;
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
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
    </AppShell>
  );
}
