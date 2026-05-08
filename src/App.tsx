import { Navigate, Route, Routes } from "react-router-dom";
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

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/access" element={<AccessManagementPage />} />
        <Route path="/dashboard/access" element={<AccessManagementPage />} />
        <Route path="/admin/forms/new" element={<FormBuilderPage />} />
        <Route path="/admin/forms/:formId" element={<FormSubmissionsPage />} />
        <Route path="/dashboard/forms/:formId" element={<FormSubmissionsPage />} />
        <Route
          path="/admin/forms/:formId/submissions/:submissionId"
          element={<FormSubmissionsPage />}
        />
        <Route
          path="/dashboard/forms/:formId/submissions/:submissionId"
          element={<FormSubmissionsPage />}
        />
        <Route path="/admin/submissions/:submissionId" element={<SubmissionDetailPage />} />
        <Route path="/f/:formId" element={<PublicFormPage />} />
        <Route path="/roadmap/:formId" element={<PublicRoadmapPage />} />
        <Route path="/m/:manifestBlobId" element={<ManifestRestorePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
