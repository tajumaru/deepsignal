import { Component, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { DashboardRecoveryPanel } from "../components/DashboardRecoveryPanel";
import { WalrusRuntimeSurface } from "../components/WalrusRuntimeSurface";
import { getChunkFailureUrl } from "../lib/chunkLoadRecovery";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "../lib/runtimeFlags";
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

type DashboardRouteBoundaryProps = {
  children: ReactNode;
  onRetry?: () => void;
  resetKey: string;
  routePath: string;
};

type DashboardRouteBoundaryState = {
  error: unknown;
};

function getLatestDashboardFailedImport() {
  if (typeof window === "undefined") {
    return null;
  }
  const failedImports = window.__DEEPSIGNAL_DEBUG__?.failedImports ?? [];
  for (let index = failedImports.length - 1; index >= 0; index -= 1) {
    const entry = failedImports[index];
    if (entry.label === "route-admin-dashboard") {
      return entry;
    }
  }
  return null;
}

class DashboardRouteBoundary extends Component<DashboardRouteBoundaryProps, DashboardRouteBoundaryState> {
  state: DashboardRouteBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): DashboardRouteBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const latestFailedImport = getLatestDashboardFailedImport();
    logRouteLifecycle("dashboard:route-lazy-error-boundary", {
      routePath: this.props.routePath,
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: error instanceof Error ? error.message : String(error ?? "Unknown dashboard route failure"),
      chunkUrl: latestFailedImport?.chunkUrl ?? getChunkFailureUrl(error),
      failedImport: latestFailedImport,
      componentStack: errorInfo.componentStack,
    });
  }

  componentDidUpdate(previousProps: DashboardRouteBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
      logRouteLifecycle("dashboard:route-lazy-boundary-reset", {
        routePath: this.props.routePath,
        resetKey: this.props.resetKey,
      });
    }
  }

  handleRetry = () => {
    logRouteLifecycle("dashboard:route-lazy-manual-retry", {
      routePath: this.props.routePath,
      failedImport: getLatestDashboardFailedImport(),
    });
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <DashboardRecoveryPanel error={this.state.error} onRetry={this.handleRetry} routePath={this.props.routePath} />;
    }

    return this.props.children;
  }
}

export function AppRoutes({
  components,
  onRetryRoute,
  routeEpoch,
  routeRetryNonce = 0,
}: {
  components: AppRouteComponents;
  onRetryRoute?: () => void;
  routeEpoch?: string;
  routeRetryNonce?: number;
}) {
  void routeEpoch;
  const location = useLocation();
  const routePath = `${location.pathname}${location.search}${location.hash}`;
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
        element={<AdminDashboardPage />}
      />
      <Route
        path="/dashboard"
        element={
          <DashboardRouteBoundary
            onRetry={onRetryRoute}
            resetKey={`dashboard:${routePath}:${routeRetryNonce}`}
            routePath={routePath}
          >
            <AdminDashboardPage />
          </DashboardRouteBoundary>
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
