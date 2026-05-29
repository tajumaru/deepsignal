import { Navigate, Route, Routes } from "react-router-dom";
import type { PublicRouteComponents } from "./publicRouteComponents";

export function PublicAppRoutes({ components }: { components: PublicRouteComponents }) {
  const { PublicFormPage, PublicRoadmapPage, ManifestRestorePage, ZkLoginCallbackPage } = components;

  return (
    <Routes>
      <Route path="/f/:formId" element={<PublicFormPage />} />
      <Route path="/roadmap/:formId" element={<PublicRoadmapPage />} />
      <Route path="/m/:manifestBlobId" element={<ManifestRestorePage />} />
      <Route path="/auth/zklogin/callback" element={<ZkLoginCallbackPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
