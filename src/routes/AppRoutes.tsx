import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { DashboardRecoveryPanel } from "../components/DashboardRecoveryPanel";
import { DashboardShellFirstPanel } from "../components/DashboardShellFirstPanel";
import { WalrusRuntimeSurface } from "../components/WalrusRuntimeSurface";
import { WalletSurface } from "../components/WalletSurface";
import { useWalletProviderRuntime } from "../components/WalletSurfaceRuntime";
import { getChunkFailureUrl } from "../lib/chunkLoadRecovery";
import {
  isDashboardBootPending,
  markDashboardWalletImportFailed,
  markDashboardWalletImportReady,
  markDashboardWalletImportSkipped,
  markDashboardWalletImportStarted,
  useDashboardProjectRestoreSnapshot,
} from "../lib/dashboardProjectRestore";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "../lib/runtimeFlags";
import { useRouteRecoveryState } from "../lib/routeRecoveryState";
import { useWalletSessionState } from "../walletSessionState";
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
  const walletRuntime = useWalletProviderRuntime();
  if (REQUIRE_GLOBAL_WALRUS_RUNTIME) {
    return <>{children}</>;
  }
  if (!walletRuntime.loaded) {
    return <>{children}</>;
  }
  return <WalrusRuntimeSurface>{children}</WalrusRuntimeSurface>;
}

function WithDeferredWalletRuntime({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  const [walletRetryNonce, setWalletRetryNonce] = useState(0);
  const silentRetryScheduledRef = useRef(false);
  const routePath = typeof window === "undefined" ? "/dashboard" : window.location.hash?.replace(/^#/, "") || "/dashboard";

  const handleRetry = useCallback(() => {
    setWalletRetryNonce((value) => value + 1);
    onRetry?.();
  }, [onRetry]);

  const handleWalletImportSlow = useCallback(() => {
    if (silentRetryScheduledRef.current) {
      return;
    }
    silentRetryScheduledRef.current = true;
    logRouteLifecycle("provider:wallet-import-silent-retry-scheduled", {
      reason: "dashboard-wallet-runtime-slow",
      routePath,
      retryKey: walletRetryNonce,
    });
    window.setTimeout(() => {
      logRouteLifecycle("provider:wallet-import-silent-retry", {
        reason: "dashboard-wallet-runtime-slow",
        routePath,
        retryKey: walletRetryNonce + 1,
      });
      setWalletRetryNonce((value) => value + 1);
    }, 750);
  }, [routePath, walletRetryNonce]);

  const handleWalletImportFailure = useCallback(
    (details: { buildVersion: string; mobileSafari: boolean; retryCount: number; retryKey: string | number; routePath: string }) => {
      markDashboardWalletImportFailed(routePath);
      logRouteLifecycle("dashboard:wallet-runtime-fallback-render", {
        ...details,
        routePath,
        recoveryScope: "wallet-only",
      });
    },
    [routePath],
  );

  return (
    <WalletSurface
      fallback={<DashboardShellFirstPanel onRetryWalletRuntime={handleRetry} routePath={routePath} />}
      onImportFailure={handleWalletImportFailure}
      onImportSlow={handleWalletImportSlow}
      onImportStart={() => markDashboardWalletImportStarted(routePath)}
      onImportSuccess={() => markDashboardWalletImportReady(routePath)}
      requestOnMount
      retryKey={walletRetryNonce}
    >
      {children}
    </WalletSurface>
  );
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

function DashboardRouteElement({
  AdminDashboardPage,
  onRetryRoute,
  routeRetryNonce,
  routePath,
}: {
  AdminDashboardPage: AppRouteComponents["AdminDashboardPage"];
  onRetryRoute?: () => void;
  routeRetryNonce?: number;
  routePath: string;
}) {
  const restoreSnapshot = useDashboardProjectRestoreSnapshot();
  const walletSession = useWalletSessionState();
  const restorePending = isDashboardBootPending(restoreSnapshot, {
    walletProviderMounted: walletSession.providerMounted,
    walletProviderPending: walletSession.providerLoading || !walletSession.providerMounted,
    walletSessionPhase: walletSession.phase,
  });
  useEffect(() => {
    if (walletSession.phase === "disconnected" && !walletSession.accountAddress) {
      markDashboardWalletImportSkipped(routePath);
      return;
    }
    if (walletSession.providerMounted && !walletSession.providerLoading && walletSession.phase !== "provider_deferred") {
      markDashboardWalletImportReady(routePath);
      return;
    }
    if (walletSession.providerLoading || walletSession.phase === "provider_deferred") {
      markDashboardWalletImportStarted(routePath);
    }
  }, [
    routePath,
    walletSession.accountAddress,
    walletSession.phase,
    walletSession.providerLoading,
    walletSession.providerMounted,
  ]);
  const showEmptyProjectState =
    !restorePending &&
    restoreSnapshot.state === "ready_without_project" &&
    restoreSnapshot.currentProjectId === "";

  return (
    <WithDeferredWalletRuntime onRetry={onRetryRoute}>
      {showEmptyProjectState ? (
        <DashboardShellFirstPanel
          onRetryWalletRuntime={onRetryRoute ?? (() => undefined)}
          routePath={routePath}
          walletStatusMessage="Wallet session ready. No signal project is selected yet."
        />
      ) : (
        <DashboardRouteBoundary
          onRetry={onRetryRoute}
          resetKey={`dashboard:${routePath}:${routeRetryNonce ?? 0}`}
          routePath={routePath}
        >
          <WithWalrusRuntime>
            <AdminDashboardPage />
          </WithWalrusRuntime>
        </DashboardRouteBoundary>
      )}
    </WithDeferredWalletRuntime>
  );
}

function CreateRouteElement({
  FormBuilderPage,
  initialSurface,
}: {
  FormBuilderPage: AppRouteComponents["FormBuilderPage"];
  initialSurface?: "home" | "composer";
}) {
  const routeRecovery = useRouteRecoveryState();

  if (routeRecovery.phase === "css_recovering") {
    return <div className="panel">Recovering route assets...</div>;
  }

  if (routeRecovery.phase === "css_failed") {
    return (
      <div className="panel">
        <strong>Route assets need reload</strong>
        <p>The Create Signal route stylesheet failed to load on this device. Reload route assets to try again.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload route assets
        </button>
      </div>
    );
  }

  return <FormBuilderPage initialSurface={initialSurface} />;
}

export function AppRoutes({
  components,
  onRetryRoute,
  routeRetryNonce = 0,
}: {
  components: AppRouteComponents;
  onRetryRoute?: () => void;
  routeRetryNonce?: number;
}) {
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
            <CreateRouteElement FormBuilderPage={FormBuilderPage} />
          </WithWalrusRuntime>
        }
      />
      <Route
        path="/compose"
        element={
          <WithWalrusRuntime>
            <CreateRouteElement FormBuilderPage={FormBuilderPage} />
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
          <DashboardRouteElement
            AdminDashboardPage={AdminDashboardPage}
            onRetryRoute={onRetryRoute}
            routePath={routePath}
            routeRetryNonce={routeRetryNonce}
          />
        }
      />
      <Route path="/admin/access" element={<AccessManagementPage />} />
      <Route path="/dashboard/access" element={<AccessManagementPage />} />
      <Route path="/dev/insights-fixture" element={<InsightsFixturePage />} />
      <Route
        path="/admin/forms/new"
        element={
          <WithWalrusRuntime>
            <CreateRouteElement FormBuilderPage={FormBuilderPage} initialSurface="composer" />
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
