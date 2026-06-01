import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { WalrusRuntimeSurface } from "../components/WalrusRuntimeSurface";
import { WalletSurface } from "../components/WalletSurface";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "../lib/runtimeFlags";
import { formatRouteLifecycleDiagnostics } from "../lib/routeDiagnostics";
import type { AppRouteComponents } from "./appRouteComponents";

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

function WithWalrusRuntime({ children }: { children: ReactNode }) {
  if (REQUIRE_GLOBAL_WALRUS_RUNTIME) {
    return <>{children}</>;
  }
  return <WalrusRuntimeSurface>{children}</WalrusRuntimeSurface>;
}

function DashboardWalletRuntimeFallback({ onRetry }: { onRetry?: () => void }) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowDiagnostics(true), 15_000);
    return () => window.clearTimeout(timer);
  }, []);

  async function copyDiagnostics() {
    await navigator.clipboard.writeText(formatRouteLifecycleDiagnostics());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="panel glow-panel route-status-panel" role="status">
      <p className="eyebrow">Wallet runtime</p>
      <h1>Preparing secure dashboard...</h1>
      <p className="muted">
        The dashboard shell is ready. DeepSignal is waiting for the wallet runtime before opening protected signal
        controls.
      </p>
      {showDiagnostics ? (
        <div className="stack">
          <p className="muted">Wallet runtime loading is taking longer than expected. Your local fallback data is preserved.</p>
          <pre className="route-status-diagnostics">{formatRouteLifecycleDiagnostics()}</pre>
          <div className="inline-actions">
            {onRetry ? (
              <button type="button" className="primary-button" onClick={onRetry}>
                Retry wallet runtime
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={() => void copyDiagnostics()}>
              {copied ? "Copied diagnostics" : "Copy diagnostics"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WithDeferredWalletRuntime({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  const [walletRetryNonce, setWalletRetryNonce] = useState(0);

  function handleRetry() {
    setWalletRetryNonce((value) => value + 1);
    onRetry?.();
  }

  return (
    <WalletSurface fallback={<DashboardWalletRuntimeFallback onRetry={handleRetry} />} retryKey={walletRetryNonce}>
      {children}
    </WalletSurface>
  );
}

export function AppRoutes({ components, onRetryRoute }: { components: AppRouteComponents; onRetryRoute?: () => void }) {
  const {
    AccessManagementPage,
    AdminDashboardPage,
    FormBuilderPage,
    SubmissionDetailPage,
    SubmittedHistoryPage,
    MyResponsesPage,
    ExploreSignalsPage,
    TroubleshootingPage,
    InsightsFixturePage,
  } = components;

  return (
    <Routes>
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
          <WithDeferredWalletRuntime onRetry={onRetryRoute}>
            <WithWalrusRuntime>
              <AdminDashboardPage />
            </WithWalrusRuntime>
          </WithDeferredWalletRuntime>
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
      <Route path="/admin/forms/:formId" element={<LegacyFormInboxRedirect basePath="/admin" />} />
      <Route path="/dashboard/forms/:formId" element={<LegacyFormInboxRedirect basePath="/dashboard" />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
