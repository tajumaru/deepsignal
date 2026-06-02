import { Component, type ReactNode } from "react";
import {
  clearChunkLoadRecoveryState,
  getChunkLoadRecoverySnapshot,
  getChunkFailureUrl,
  isChunkLoadFailure,
  recoverFromChunkLoadFailure,
} from "../lib/chunkLoadRecovery";
import { buildInfo } from "../lib/buildInfo";
import {
  getMixedBuildStatus,
  recordBuildAsset,
  clearBuildAssetRecoveryState,
  recoverFromMixedBuildAssets,
  type BuildAssetRecord,
} from "../lib/buildAssetDiagnostics";
import { updateDeepSignalToLatest } from "../lib/buildUpdate";
import { formatRouteLifecycleDiagnostics, logRouteLifecycle } from "../lib/routeDiagnostics";
import type { ChunkDependencyProbe, ChunkProbe } from "../lib/routeDiagnostics";
import {
  collectRouteDiagnostics,
  getProviderReadiness,
  getRouteId,
  shouldShowRouteDiagnostics,
  type RouteDiagnostics,
} from "./routeDiagnostics";
import { reportSystemError } from "../services/systemSignalReporter";

const LAST_EXPLORE_ERROR_KEY = "deepsignal:lastExploreError";

type RouteErrorDiagnostics = {
  errorName: string;
  errorMessage: string;
  errorStack: string;
  componentStack: string;
  routeId: string;
  routePath: string;
  pathname: string;
  hash: string;
  chunkUrl: string | null;
  buildVersion: string;
  buildTime: string;
  gitHash: string;
  rootBuildVersion: string;
  rootBuildTime: string;
  rootGitHash: string;
  mixedBuildAssetsDetected: boolean;
  observedBuildAssets: BuildAssetRecord[];
  userAgent: string;
  providerReadiness: Record<string, unknown>;
  providerState: Record<string, unknown>;
  hydrationPhase: string;
  storageMode: string;
  selectedProjectId: string;
  routeDiagnostics: RouteDiagnostics;
  routeLifecycle: string;
  chunkRecovery: ReturnType<typeof getChunkLoadRecoverySnapshot>;
  failedImportDiagnostics: Array<{
    at: number;
    label: string;
    message: string;
    chunkUrl?: string | null;
    category?: "chunkLoad" | "missingExport" | "runtime" | "timeout";
    expectedExport?: string;
    moduleKeys?: string[];
    resolvedExport?: "default" | string | "missing";
    probe?: ChunkProbe;
    dependencyProbe?: ChunkDependencyProbe;
  }>;
  recordedAt: string;
};

function safeWriteLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Diagnostics are best effort. The route fallback should still render if storage is blocked.
  }
}

function getLastFailedImportChunkUrl() {
  if (typeof window === "undefined") {
    return null;
  }
  const failedImports = window.__DEEPSIGNAL_DEBUG__?.failedImports ?? [];
  for (let index = failedImports.length - 1; index >= 0; index -= 1) {
    const chunkUrl = failedImports[index]?.chunkUrl;
    if (chunkUrl) {
      return chunkUrl;
    }
  }
  return null;
}

export function MixedBuildRecoveryScreen({ observed }: { observed: BuildAssetRecord[] }) {
  return (
    <div className="panel glow-panel route-status-panel" role="alert">
      <p className="eyebrow">Signal surface recovery</p>
      <h1>New version available</h1>
      <p className="muted">
        DeepSignal has been updated. Load the latest version. Local fallback data and submitted signal records are
        preserved.
      </p>
      <div className="inline-actions">
        <button type="button" className="primary-button" onClick={() => void updateDeepSignalToLatest()}>
          Update DeepSignal
        </button>
      </div>
      {shouldShowRouteDiagnostics(typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`) ? (
        <details className="route-diagnostics-panel" open>
          <summary>Build diagnostics</summary>
          <pre className="route-status-diagnostics">{JSON.stringify(observed, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

export class RouteErrorBoundary extends Component<
  { children: ReactNode; resetKey: string; routePath: string; onRetryRoute: () => void },
  { error: Error | null; diagnostics: RouteErrorDiagnostics | null; diagnosticsCopied: boolean; retryCount: number }
> {
  state: { error: Error | null; diagnostics: RouteErrorDiagnostics | null; diagnosticsCopied: boolean; retryCount: number } = {
    error: null,
    diagnostics: null,
    diagnosticsCopied: false,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    const chunkUrl = getChunkFailureUrl(error) ?? getLastFailedImportChunkUrl();
    const userAgent = typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
    const pathname = typeof window === "undefined" ? this.props.routePath.split(/[?#]/)[0] || "/" : window.location.pathname;
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    recordBuildAsset(`route-error:${getRouteId(this.props.routePath)}`, buildInfo);
    const mixedBuildStatus = getMixedBuildStatus();
    const routeDiagnostics = collectRouteDiagnostics(this.props.routePath);
    const boundaryDiagnostics = {
      routePath: this.props.routePath,
      routeId: getRouteId(this.props.routePath),
      pathname,
      hash,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack ?? "",
      chunkUrl,
      buildVersion: buildInfo.appVersion,
      buildTime: buildInfo.buildTime,
      gitHash: buildInfo.gitHash,
      rootBuildVersion: mixedBuildStatus.root.appVersion,
      rootBuildTime: mixedBuildStatus.root.buildTime,
      rootGitHash: mixedBuildStatus.root.gitHash,
      mixedBuildAssetsDetected: mixedBuildStatus.detected,
      observedBuildAssets: mixedBuildStatus.observed,
      userAgent,
      providerReadiness: getProviderReadiness(),
      providerState: routeDiagnostics.providerState,
      hydrationPhase: routeDiagnostics.hydrationPhase,
      storageMode: routeDiagnostics.storageMode,
      selectedProjectId: routeDiagnostics.selectedProjectId,
      routeDiagnostics,
      routeLifecycle: formatRouteLifecycleDiagnostics(),
      chunkRecovery: getChunkLoadRecoverySnapshot(),
      failedImportDiagnostics: window.__DEEPSIGNAL_DEBUG__?.failedImports?.slice(-5) ?? [],
      componentStack: errorInfo.componentStack,
      recordedAt: new Date().toISOString(),
    };
    const diagnosticsText = JSON.stringify(boundaryDiagnostics, null, 2);
    if (boundaryDiagnostics.routeId === "explore") {
      safeWriteLocalStorage(LAST_EXPLORE_ERROR_KEY, diagnosticsText);
    }
    reportSystemError({
      error,
      errorName: boundaryDiagnostics.errorName,
      errorMessage: boundaryDiagnostics.errorMessage,
      errorStack: boundaryDiagnostics.errorStack,
      routePath: boundaryDiagnostics.routePath,
      routeId: boundaryDiagnostics.routeId,
      chunkUrl,
      severity: chunkUrl ? "critical" : "error",
      sourceContext: "route-error-boundary",
      diagnostics: {
        componentStack: errorInfo.componentStack,
        routeDiagnostics,
        failedImportDiagnostics: boundaryDiagnostics.failedImportDiagnostics,
        mixedBuildAssetsDetected: mixedBuildStatus.detected,
      },
    });
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
      rootBuildVersion: mixedBuildStatus.root.appVersion,
      rootBuildTime: mixedBuildStatus.root.buildTime,
      rootGitHash: mixedBuildStatus.root.gitHash,
      mixedBuildAssetsDetected: mixedBuildStatus.detected,
      observedBuildAssets: mixedBuildStatus.observed,
      userAgent,
      componentStack: errorInfo.componentStack,
    });
    if (mixedBuildStatus.detected) {
      logRouteLifecycle("mixed_build_assets_detected", {
        routePath: this.props.routePath,
        root: mixedBuildStatus.root,
        observed: mixedBuildStatus.observed,
        reason: mixedBuildStatus.reason,
      });
    }
    this.setState({ diagnostics: boundaryDiagnostics, diagnosticsCopied: false });
    if (!recoverFromMixedBuildAssets(mixedBuildStatus)) {
      recoverFromChunkLoadFailure(error);
    }
  }

  componentDidUpdate(prevProps: Readonly<{ children: ReactNode; resetKey: string; routePath: string; onRetryRoute: () => void }>) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, diagnostics: null, diagnosticsCopied: false, retryCount: 0 });
    }
  }

  handleRetry = () => {
    const nextRetryCount = this.state.retryCount + 1;
    if (nextRetryCount >= 2) {
      clearChunkLoadRecoveryState();
      clearBuildAssetRecoveryState();
    }

    logRouteLifecycle("route:error-boundary-retry", {
      routePath: this.props.routePath,
      retryCount: nextRetryCount,
      clearedStaleRecoveryState: nextRetryCount >= 2,
      chunkFailure: isChunkLoadFailure(this.state.error),
    });
    this.props.onRetryRoute();
    this.setState({ error: null, diagnostics: null, diagnosticsCopied: false, retryCount: nextRetryCount });
  }

  handleHardRefresh = async () => {
    clearChunkLoadRecoveryState();
    clearBuildAssetRecoveryState();
    await updateDeepSignalToLatest({
      reason: isChunkLoadFailure(this.state.error) ? "chunk_load_failure" : "latest_build_available",
      currentBuildVersion: `${buildInfo.appVersion}|${buildInfo.buildTime}|${buildInfo.gitHash}`,
      latestBuildVersion: `${buildInfo.appVersion}|${buildInfo.buildTime}|${buildInfo.gitHash}`,
      currentBuild: buildInfo,
      latestBuild: buildInfo,
      detectedAt: new Date().toISOString(),
      mixedBuildAssetsDetected: Boolean(this.state.diagnostics?.mixedBuildAssetsDetected),
    });
  }

  handleCopyDiagnostics = async () => {
    const diagnosticsText = JSON.stringify(
      this.state.diagnostics ?? {
        errorName: this.state.error?.name ?? "unknown",
        errorMessage: this.state.error?.message ?? "unknown",
        errorStack: this.state.error?.stack ?? "",
        componentStack: "",
        routePath: this.props.routePath,
        routeId: getRouteId(this.props.routePath),
        pathname: typeof window === "undefined" ? this.props.routePath.split(/[?#]/)[0] || "/" : window.location.pathname,
        chunkUrl: getChunkFailureUrl(this.state.error) ?? getLastFailedImportChunkUrl(),
        buildVersion: buildInfo.appVersion,
        buildTime: buildInfo.buildTime,
        gitHash: buildInfo.gitHash,
        rootBuildVersion: buildInfo.appVersion,
        rootBuildTime: buildInfo.buildTime,
        rootGitHash: buildInfo.gitHash,
        mixedBuildAssetsDetected: false,
        observedBuildAssets: [],
        userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
        providerReadiness: getProviderReadiness(),
        providerState: collectRouteDiagnostics(this.props.routePath).providerState,
        hydrationPhase: collectRouteDiagnostics(this.props.routePath).hydrationPhase,
        storageMode: collectRouteDiagnostics(this.props.routePath).storageMode,
        selectedProjectId: collectRouteDiagnostics(this.props.routePath).selectedProjectId,
        routeDiagnostics: collectRouteDiagnostics(this.props.routePath),
        routeLifecycle: formatRouteLifecycleDiagnostics(),
        chunkRecovery: getChunkLoadRecoverySnapshot(),
        failedImportDiagnostics: window.__DEEPSIGNAL_DEBUG__?.failedImports?.slice(-5) ?? [],
        recordedAt: new Date().toISOString(),
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
      const showDiagnostics = Boolean(diagnostics) || chunkFailure || shouldShowRouteDiagnostics(this.props.routePath);
      const headline = chunkFailure
        ? "App update detected, refresh required."
        : "We couldn't reopen this workspace yet. Your local signals are still preserved.";
      const failedImportDiagnostics = diagnostics?.failedImportDiagnostics ?? [];
      const latestFailedImport = failedImportDiagnostics[failedImportDiagnostics.length - 1];
      const dependencyFailures = latestFailedImport?.dependencyProbe?.dependencies.filter((probe: ChunkProbe) => !probe.ok) ?? [];

      return (
        <div className="panel glow-panel route-status-panel" role="alert">
          <p className="eyebrow">Signal surface</p>
          <h1>{headline}</h1>
          <p className="muted">
            {chunkFailure
              ? "A route chunk could not be loaded, usually because Safari has an older asset cached while a newer build is active. Local fallback data is still preserved."
              : "Retry the route to restore the workspace. Local fallback data is still preserved."}
          </p>
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={() => void this.handleHardRefresh()}>
              Update DeepSignal
            </button>
            <button type="button" className="ghost-button" onClick={this.handleRetry}>
              {this.state.retryCount === 0 ? "Retry surface" : "Retry after clearing stale markers"}
            </button>
            <button type="button" className="ghost-button" onClick={() => void this.handleCopyDiagnostics()}>
              {this.state.diagnosticsCopied ? "Copied diagnostics" : "Copy diagnostics"}
            </button>
          </div>
          {showDiagnostics && diagnostics ? (
            <details className="route-diagnostics-panel">
              <summary>Technical details</summary>
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
                <dt>mixed build</dt>
                <dd>{diagnostics.mixedBuildAssetsDetected ? "mixed_build_assets_detected" : "no"}</dd>
                <dt>root build</dt>
                <dd>
                  v{diagnostics.rootBuildVersion} build {diagnostics.rootBuildTime} {diagnostics.rootGitHash}
                </dd>
                <dt>pathname</dt>
                <dd>{diagnostics.pathname}</dd>
                <dt>hash</dt>
                <dd>{diagnostics.hash || "none"}</dd>
                <dt>failed chunk URL</dt>
                <dd>{diagnostics.chunkUrl ?? "n/a"}</dd>
                <dt>lazy import category</dt>
                <dd>{latestFailedImport?.category ?? "n/a"}</dd>
                <dt>expected export</dt>
                <dd>{latestFailedImport?.expectedExport ?? "n/a"}</dd>
                <dt>resolved export</dt>
                <dd>{latestFailedImport?.resolvedExport ?? "n/a"}</dd>
                <dt>dependency failures</dt>
                <dd>
                  {latestFailedImport?.dependencyProbe
                    ? `${dependencyFailures.length}/${latestFailedImport.dependencyProbe.totalCount}`
                    : "not probed"}
                </dd>
                <dt>chunk retry</dt>
                <dd>
                  {diagnostics.chunkRecovery.count}/{diagnostics.chunkRecovery.limit}
                </dd>
                <dt>userAgent</dt>
                <dd>{diagnostics.userAgent}</dd>
                <dt>storageMode</dt>
                <dd>{diagnostics.storageMode}</dd>
                <dt>selectedProjectId</dt>
                <dd>{diagnostics.selectedProjectId || "n/a"}</dd>
                <dt>hydration phase</dt>
                <dd>{diagnostics.hydrationPhase}</dd>
                <dt>provider readiness</dt>
                <dd>
                  <pre className="route-status-diagnostics">{JSON.stringify(diagnostics.providerReadiness, null, 2)}</pre>
                </dd>
              </dl>
              {latestFailedImport?.moduleKeys ? (
                <>
                  <p className="eyebrow">module keys</p>
                  <pre className="route-status-diagnostics">{JSON.stringify(latestFailedImport.moduleKeys, null, 2)}</pre>
                </>
              ) : null}
              {latestFailedImport?.probe || latestFailedImport?.dependencyProbe ? (
                <>
                  <p className="eyebrow">chunk probe</p>
                  <pre className="route-status-diagnostics">
                    {JSON.stringify(
                      {
                        parent: latestFailedImport.probe ?? null,
                        dependencies: latestFailedImport.dependencyProbe ?? null,
                        failedDependencies: dependencyFailures,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </>
              ) : null}
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
