import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { WalletSurface } from "./components/WalletSurface";
import { WalrusRuntimeSurface } from "./components/WalrusRuntimeSurface";
import {
  CREATE_FORM_DRAFT_STORAGE_KEY,
  CREATE_FORM_GUEST_DRAFT_STORAGE_KEY,
  parseStoredCreateFormDraft,
} from "./features/createForm/utils";
import { getChunkFailureUrl, isChunkLoadFailure, recoverFromChunkLoadFailure } from "./lib/chunkLoadRecovery";
import { buildInfo } from "./lib/buildInfo";
import { retryLazyImport } from "./lib/lazyRetry";
import { copyPerfDiagnostics, endPerf, markPerfMilestone } from "./lib/perf";
import { getSelectedProjectId } from "./lib/projectRegistry";
import { resetLocalEnvironment } from "./lib/resetEnvironment";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle } from "./lib/routeDiagnostics";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import { scheduleIdleTask } from "./lib/scheduleIdleTask";
import { RpcInfrastructureProvider } from "./RpcInfrastructureProvider";
import { getStorageRuntimeStatus } from "./storage/storageFactory";

const AccessManagementPage = lazy(() =>
  retryLazyImport(() => import("./pages/AccessManagementPage"), "route-access-management").then((module) => ({
    default: module.AccessManagementPage,
  })),
);
const AdminDashboardPage = lazy(() =>
  retryLazyImport(() => import("./pages/AdminDashboardPage"), "route-admin-dashboard").then((module) => ({
    default: module.AdminDashboardPage,
  })),
);
const FormBuilderPage = lazy(() =>
  retryLazyImport(() => import("./pages/FormBuilderPage"), "route-form-builder").then((module) => ({
    default: module.FormBuilderPage,
  })),
);
const ManifestRestorePage = lazy(() =>
  retryLazyImport(() => import("./pages/ManifestRestorePage"), "route-manifest-restore").then((module) => ({
    default: module.ManifestRestorePage,
  })),
);
const FormSubmissionsPage = lazy(() =>
  retryLazyImport(() => import("./pages/FormSubmissionsPage"), "route-form-submissions").then((module) => ({
    default: module.FormSubmissionsPage,
  })),
);
const PublicRoadmapPage = lazy(() =>
  retryLazyImport(() => import("./pages/PublicRoadmapPage"), "route-public-roadmap").then((module) => ({
    default: module.PublicRoadmapPage,
  })),
);
const SubmissionDetailPage = lazy(() =>
  retryLazyImport(() => import("./pages/SubmissionDetailPage"), "route-submission-detail").then((module) => ({
    default: module.SubmissionDetailPage,
  })),
);
const ExploreSignalsPage = lazy(() =>
  retryLazyImport(() => import("./pages/ExploreSignalsPage"), "route-explore").then((module) => ({
    default: module.ExploreSignalsPage,
  })),
);
const TroubleshootingPage = lazy(() =>
  retryLazyImport(() => import("./pages/TroubleshootingPage"), "route-troubleshooting").then((module) => ({
    default: module.TroubleshootingPage,
  })),
);
const InsightsFixturePage = lazy(() =>
  retryLazyImport(() => import("./pages/InsightsFixturePage"), "route-insights-fixture").then((module) => ({
    default: module.InsightsFixturePage,
  })),
);
const LandingPage = lazy(() =>
  retryLazyImport(() => import("./pages/LandingPage"), "route-landing").then((module) => ({
    default: module.LandingPage,
  })),
);
const PublicFormPage = lazy(() =>
  retryLazyImport(() => import("./pages/PublicFormPage"), "route-public-form").then((module) => ({
    default: module.PublicFormPage,
  })),
);
const ZkLoginCallbackPage = lazy(() =>
  retryLazyImport(() => import("./pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) => ({
    default: module.ZkLoginCallbackPage,
  })),
);

function prefetchExploreRoute() {
  void retryLazyImport(() => import("./pages/ExploreSignalsPage"), "prefetch-route-explore").catch(() => undefined);
}

function WithWalrusRuntime({ children }: { children: ReactNode }) {
  if (REQUIRE_GLOBAL_WALRUS_RUNTIME) {
    return <>{children}</>;
  }
  return <WalrusRuntimeSurface>{children}</WalrusRuntimeSurface>;
}

const WORKSPACE_RECOVERY_TIMEOUT_MS = 3200;
const LAST_EXPLORE_ERROR_KEY = "deepsignal:lastExploreError";

type RouteDiagnostics = {
  routePath: string;
  selectedProjectId: string;
  walletConnectedState: "connected" | "disconnected" | "unknown";
  storageMode: string;
  localDraftParseStatus: "missing" | "valid" | "invalid" | "unavailable";
};

type RouteErrorDiagnostics = {
  errorName: string;
  errorMessage: string;
  errorStack: string;
  componentStack: string;
  routeId: string;
  routePath: string;
  pathname: string;
  chunkUrl: string | null;
  buildVersion: string;
  buildTime: string;
  gitHash: string;
  userAgent: string;
  routeDiagnostics: RouteDiagnostics;
  routeLifecycle: string;
  recordedAt: string;
};

function getRouteId(routePath: string) {
  const pathname = routePath.split(/[?#]/)[0] || "/";
  if (pathname === "/" || pathname === "") {
    return "landing";
  }
  if (pathname === "/explore" || pathname === "/signals") {
    return "explore";
  }
  if (pathname === "/create") {
    return "create-signal";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "admin";
  }
  if (pathname.startsWith("/f/")) {
    return "public-form";
  }
  if (pathname.startsWith("/roadmap/")) {
    return "public-roadmap";
  }
  if (pathname.startsWith("/m/")) {
    return "manifest-restore";
  }
  return pathname.replace(/^\/+/, "") || "unknown";
}

function shouldShowRouteDiagnostics(routePath: string) {
  if (import.meta.env.MODE !== "production") {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("debug") === "1" || routePath.includes("debug=1");
}

function safeWriteLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Diagnostics are best effort. The route fallback should still render if storage is blocked.
  }
}

function readPersistedWalletConnectionState(): RouteDiagnostics["walletConnectedState"] {
  if (typeof window === "undefined") {
    return "unknown";
  }

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.toLowerCase().includes("wallet")) {
        continue;
      }
      const value = window.localStorage.getItem(key);
      if (!value) {
        continue;
      }
      const lowerValue = value.toLowerCase();
      if (lowerValue.includes("connected") || lowerValue.includes("currentwallet") || lowerValue.includes("accounts")) {
        return "connected";
      }
    }
    return "disconnected";
  } catch {
    return "unknown";
  }
}

function readCreateDraftParseStatus() {
  if (typeof window === "undefined") {
    return "unavailable" as const;
  }

  try {
    const adminDraft = window.localStorage.getItem(CREATE_FORM_DRAFT_STORAGE_KEY);
    const guestDraft = window.localStorage.getItem(CREATE_FORM_GUEST_DRAFT_STORAGE_KEY);
    const rawDraft = adminDraft ?? guestDraft;
    if (!rawDraft) {
      return "missing" as const;
    }
    return parseStoredCreateFormDraft(rawDraft).status === "valid" ? "valid" : "invalid";
  } catch {
    return "unavailable" as const;
  }
}

function collectRouteDiagnostics(routePath: string): RouteDiagnostics {
  const storageRuntime = getStorageRuntimeStatus();
  return {
    routePath,
    selectedProjectId: getSelectedProjectId(),
    walletConnectedState: readPersistedWalletConnectionState(),
    storageMode: storageRuntime.mode,
    localDraftParseStatus: readCreateDraftParseStatus(),
  };
}

function WorkspaceRestoreFallback({ onRetry }: { onRetry?: () => void }) {
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [resettingState, setResettingState] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecoveryVisible(true);
    }, WORKSPACE_RECOVERY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleResetLocalState() {
    setResettingState(true);
    try {
      await resetLocalEnvironment();
    } finally {
      window.location.assign("/");
    }
  }

  async function handleCopyDiagnostics() {
    try {
      await navigator.clipboard.writeText(formatRouteLifecycleDiagnostics());
    } catch {
      await copyPerfDiagnostics(["app:", "lazy:", "admin:", "public-form:"]);
    }
    setCopiedDiagnostics(true);
    window.setTimeout(() => setCopiedDiagnostics(false), 1800);
  }

  return (
    <div className="panel glow-panel route-status-panel" role="status">
      <p className="eyebrow">Signal surface</p>
      <h1>Loading workspace...</h1>
      <p className="muted">Restoring the Explore surface and local fallback data.</p>
      {recoveryVisible ? (
        <div className="stack">
          <p className="muted">
            Workspace restore is taking longer than expected. DeepSignal can continue in recovery mode even if local
            fallback data or a publish state is broken.
          </p>
          <pre className="route-status-diagnostics">{formatRouteLifecycleDiagnostics()}</pre>
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
              Retry workspace
            </button>
            <button type="button" className="ghost-button" onClick={() => void handleCopyDiagnostics()}>
              {copiedDiagnostics ? "Copied diagnostics" : "Copy diagnostics"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => void handleResetLocalState()}
              disabled={resettingState}
            >
              {resettingState ? "Resetting local state..." : "Reset local state"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

class RouteErrorBoundary extends Component<
  { children: ReactNode; resetKey: string; routePath: string },
  { error: Error | null; diagnostics: RouteErrorDiagnostics | null; diagnosticsCopied: boolean }
> {
  state: { error: Error | null; diagnostics: RouteErrorDiagnostics | null; diagnosticsCopied: boolean } = {
    error: null,
    diagnostics: null,
    diagnosticsCopied: false,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    const chunkUrl = getChunkFailureUrl(error);
    const userAgent = typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
    const pathname = typeof window === "undefined" ? this.props.routePath.split(/[?#]/)[0] || "/" : window.location.pathname;
    const boundaryDiagnostics = {
      routePath: this.props.routePath,
      routeId: getRouteId(this.props.routePath),
      pathname,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack ?? "",
      chunkUrl,
      buildVersion: buildInfo.appVersion,
      buildTime: buildInfo.buildTime,
      gitHash: buildInfo.gitHash,
      userAgent,
      routeDiagnostics: collectRouteDiagnostics(this.props.routePath),
      routeLifecycle: formatRouteLifecycleDiagnostics(),
      componentStack: errorInfo.componentStack,
      recordedAt: new Date().toISOString(),
    };
    const diagnosticsText = JSON.stringify(boundaryDiagnostics, null, 2);
    if (boundaryDiagnostics.routeId === "explore") {
      safeWriteLocalStorage(LAST_EXPLORE_ERROR_KEY, diagnosticsText);
    }
    console.error("DeepSignal route failed to render.", {
      error,
      ...boundaryDiagnostics,
    });
    logRouteLifecycle("route:error-boundary", {
      routePath: this.props.routePath,
      error,
      errorName: error.name,
      errorMessage: error.message,
      chunkUrl,
      buildVersion: buildInfo.appVersion,
      buildTime: buildInfo.buildTime,
      gitHash: buildInfo.gitHash,
      userAgent,
      componentStack: errorInfo.componentStack,
    });
    this.setState({ diagnostics: boundaryDiagnostics, diagnosticsCopied: false });
    recoverFromChunkLoadFailure(error);
  }

  componentDidUpdate(prevProps: Readonly<{ children: ReactNode; resetKey: string; routePath: string }>) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, diagnostics: null, diagnosticsCopied: false });
    }
  }

  handleRetry = () => {
    const { error } = this.state;
    if (error && isChunkLoadFailure(error)) {
      recoverFromChunkLoadFailure(error);
      window.location.reload();
      return;
    }

    this.setState({ error: null, diagnostics: null, diagnosticsCopied: false });
  }

  handleCopyDiagnostics = async () => {
    const diagnosticsText = JSON.stringify(
      this.state.diagnostics ?? {
        errorName: this.state.error?.name ?? "unknown",
        errorMessage: this.state.error?.message ?? "unknown",
        routePath: this.props.routePath,
        routeId: getRouteId(this.props.routePath),
        buildVersion: buildInfo.appVersion,
        userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
      },
      null,
      2,
    );

    try {
      await navigator.clipboard.writeText(diagnosticsText);
    } catch {
      safeWriteLocalStorage(LAST_EXPLORE_ERROR_KEY, diagnosticsText);
    }
    this.setState({ diagnosticsCopied: true });
    window.setTimeout(() => this.setState({ diagnosticsCopied: false }), 1800);
  }

  render() {
    if (this.state.error) {
      const chunkFailure = isChunkLoadFailure(this.state.error);
      const diagnostics = this.state.diagnostics;
      const showDiagnostics = shouldShowRouteDiagnostics(this.props.routePath);

      return (
        <div className="panel glow-panel route-status-panel" role="alert">
          <p className="eyebrow">Signal surface</p>
          <h1>{chunkFailure ? "Explore could not open cleanly." : "Explore hit an unexpected fault."}</h1>
          <p className="muted">
            {chunkFailure
              ? "Refresh the page to retry the current chunk. Local fallback data is still preserved."
              : "Retry the route to restore the workspace. Local fallback data is still preserved."}
          </p>
          <p className="muted route-error-summary">
            Diagnostic: {this.state.error.name || "Error"} - {this.state.error.message || "No error message reported."}
          </p>
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={this.handleRetry}>
              {chunkFailure ? "Retry chunk" : "Retry route"}
            </button>
            <button type="button" className="ghost-button" onClick={() => void this.handleCopyDiagnostics()}>
              {this.state.diagnosticsCopied ? "Copied diagnostics" : "Copy diagnostics"}
            </button>
          </div>
          {showDiagnostics && diagnostics ? (
            <details className="route-diagnostics-panel" open>
              <summary>Route diagnostics</summary>
              <dl>
                <dt>error.name</dt>
                <dd>{diagnostics.errorName}</dd>
                <dt>error.message</dt>
                <dd>{diagnostics.errorMessage}</dd>
                <dt>route id</dt>
                <dd>{diagnostics.routeId}</dd>
                <dt>build version</dt>
                <dd>
                  v{diagnostics.buildVersion} build {diagnostics.buildTime} {diagnostics.gitHash}
                </dd>
                <dt>pathname</dt>
                <dd>{diagnostics.pathname}</dd>
                <dt>failed chunk URL</dt>
                <dd>{diagnostics.chunkUrl ?? "n/a"}</dd>
                <dt>userAgent</dt>
                <dd>{diagnostics.userAgent}</dd>
              </dl>
              <p className="eyebrow">componentStack</p>
              <pre className="route-status-diagnostics">{diagnostics.componentStack || "n/a"}</pre>
              <p className="eyebrow">error.stack</p>
              <pre className="route-status-diagnostics">{diagnostics.errorStack || "n/a"}</pre>
            </details>
          ) : null}
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

function InitialBootReady({ onReady, routePath, children }: { onReady: () => void; routePath: string; children: ReactNode }) {
  useEffect(() => {
    endPerf("app:render", "ok");
    markPerfMilestone("route:interactive", routePath);
    markPerfMilestone("workspace:ready", routePath);
    onReady();
  }, [onReady, routePath]);

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
  const routeNeedsWalletSurface =
    location.pathname === "/admin" ||
    location.pathname === "/dashboard" ||
    location.pathname === "/create" ||
    location.pathname === "/troubleshooting" ||
    location.pathname.startsWith("/admin/") ||
    location.pathname.startsWith("/dashboard/");

  const dismissBootOverlay = useCallback(() => {
    document.getElementById("boot-overlay")?.remove();
    document.body.classList.remove("booting");
    setBootDismissed(true);
  }, []);

  useEffect(() => {
    logRouteLifecycle("route:enter", {
      routePath: `${location.pathname}${location.search}${location.hash}`,
      walletSurface: routeNeedsWalletSurface,
      publicChrome: routeUsesPublicChrome,
    });
    return () => {
      logRouteLifecycle("route:leave", {
        routePath: `${location.pathname}${location.search}${location.hash}`,
      });
    };
  }, [location.hash, location.pathname, location.search, routeNeedsWalletSurface, routeUsesPublicChrome]);

  useEffect(() => {
    if (location.pathname !== "/") {
      return undefined;
    }
    return scheduleIdleTask(() => prefetchExploreRoute(), 3500);
  }, [location.pathname]);

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
    <AppShell walletAvailable={routeNeedsWalletSurface} chrome={routeUsesPublicChrome ? "public" : "full"}>
      <RouteErrorBoundary resetKey={location.key} routePath={`${location.pathname}${location.search}${location.hash}`}>
        <Suspense fallback={<WorkspaceRestoreFallback />}>
          <InitialBootReady routePath={`${location.pathname}${location.search}${location.hash}`} onReady={() => setInitialRouteReady(true)}>
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
              <Route path="/dev/insights-fixture" element={<InsightsFixturePage />} />
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

  if (!routeNeedsWalletSurface) {
    return <RpcInfrastructureProvider>{routeSurface}</RpcInfrastructureProvider>;
  }

  return (
    <RpcInfrastructureProvider>
      <WalletSurface
        fallback={
          <InitialBootReady routePath={`${location.pathname}${location.search}${location.hash}`} onReady={() => setInitialRouteReady(true)}>
            <AppShell walletAvailable={false} chrome={routeUsesPublicChrome ? "public" : "full"}>
              <WorkspaceRestoreFallback onRetry={() => window.location.reload()} />
            </AppShell>
          </InitialBootReady>
        }
      >
        {routeSurface}
      </WalletSurface>
    </RpcInfrastructureProvider>
  );
}
