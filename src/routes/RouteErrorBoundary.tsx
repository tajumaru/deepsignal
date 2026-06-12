import { Component, Suspense, lazy, type ReactNode } from "react";
import {
  clearChunkLoadRecoveryState,
  getChunkLoadRecoverySnapshot,
  getChunkFailureUrl,
  getChunkLoadFailureCategory,
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
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { getWalletProviderRuntimeSnapshot } from "../components/WalletSurfaceRuntime";
import { getWalletSessionStateSnapshot } from "../walletSessionState";
import {
  getRouteId,
  shouldShowRouteDiagnostics,
} from "./routeDiagnostics";
import { getRouteRuntimeMetadata } from "./routeRuntimePolicy";
import { reportSystemError } from "../services/systemSignalReporterClient";
import type { RouteErrorDiagnostics } from "./routeErrorDiagnosticsRuntime";

const LAST_EXPLORE_ERROR_KEY = "deepsignal:lastExploreError";

const DashboardDegradedShell = lazy(() =>
  import("../components/DashboardDegradedShell").then((module) => ({
    default: module.DashboardDegradedShell,
  })),
);
const LocalRecoveryCenter = lazy(() =>
  import("../components/LocalRecoveryCenter").then((module) => ({
    default: module.LocalRecoveryCenter,
  })),
);

type RouteErrorBoundaryState = {
  cacheClearMessage: string;
  clearingRouteCache: boolean;
  diagnosticsCopied: boolean;
  diagnostics: RouteErrorDiagnostics | null;
  error: Error | null;
  liteModeContinued: boolean;
  retryCount: number;
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

function getRecentFailedImportDiagnostics() {
  if (typeof window === "undefined") {
    return [];
  }
  return window.__DEEPSIGNAL_DEBUG__?.failedImports?.slice(-5) ?? [];
}

let routeErrorDiagnosticsRuntimePromise: Promise<typeof import("./routeErrorDiagnosticsRuntime")> | null = null;

function loadRouteErrorDiagnosticsRuntime() {
  if (!routeErrorDiagnosticsRuntimePromise) {
    routeErrorDiagnosticsRuntimePromise = import("./routeErrorDiagnosticsRuntime");
  }
  return routeErrorDiagnosticsRuntimePromise;
}

export function MixedBuildRecoveryScreen({ observed }: { observed: BuildAssetRecord[] }) {
  return (
    <div className="panel glow-panel route-status-panel route-status-panel-compact" role="alert">
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
        <details className="route-diagnostics-panel route-diagnostics-panel-compact">
          <summary>Build diagnostics</summary>
          <pre className="route-status-diagnostics">{JSON.stringify(observed, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

export class RouteErrorBoundary extends Component<
  { children: ReactNode; resetKey: string; routePath: string; onRetryRoute: () => void },
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = {
    cacheClearMessage: "",
    clearingRouteCache: false,
    error: null,
    diagnostics: null,
    diagnosticsCopied: false,
    liteModeContinued: false,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    const routePolicy = getRouteRuntimeMetadata(this.props.routePath);
    const routePath = this.props.routePath;
    const walletRuntime = getWalletProviderRuntimeSnapshot();
    const walletContextReady = walletRuntime.contextAvailable;
    const chunkRecovery = recoverFromChunkLoadFailure(error, {
      routePath,
      policyId: routePolicy.policyId,
      walletContextReady,
    });
    const chunkFailureCategory = getChunkLoadFailureCategory(error);
    const recoveryAction = chunkRecovery.fallbackAction;
    const recoveryRetryCount = chunkRecovery.retryCount;
    const chunkUrl = getChunkFailureUrl(error) ?? getLastFailedImportChunkUrl();
    const userAgent = typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
    const pathname = typeof window === "undefined" ? this.props.routePath.split(/[?#]/)[0] || "/" : window.location.pathname;
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    recordBuildAsset(`route-error:${getRouteId(this.props.routePath)}`, buildInfo);
    const mixedBuildStatus = getMixedBuildStatus();
    const routeId = getRouteId(this.props.routePath);
    const failedImportDiagnostics = getRecentFailedImportDiagnostics();
    const walletSession = getWalletSessionStateSnapshot();
    const missingSuiClientContext = /Could not find SuiClientContext/i.test(error.message);
    const missingDAppKitContext = /DAppKitContext|Could not find DAppKit/i.test(error.message);
    const walletProviderDiagnostics = {
      appShellHeaderRenderedWalletRuntimePanel: window.__DEEPSIGNAL_DEBUG__?.providerReadiness?.appShellHeaderWalletPanel === "runtime",
      routeWalletSurface: routePolicy.showWalletUi,
      suiClientContextAvailable: walletRuntime.contextAvailable,
      walletProviderChunkLoaded: walletRuntime.chunkLoaded,
      walletProviderCommittedOnce: walletRuntime.hasCommittedOnce,
      walletProviderMounted: walletSession.providerMounted,
      walletProviderPending: walletSession.providerLoading || !walletSession.providerMounted,
      walletSessionPhase: walletSession.phase,
    };
    reportSystemError({
      error,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack ?? "",
      routePath: this.props.routePath,
      routeId,
      chunkUrl,
      severity: chunkUrl ? "critical" : "error",
      sourceContext: "route-error-boundary",
      diagnostics: {
        componentStack: errorInfo.componentStack,
        failedImportDiagnostics,
        mixedBuildAssetsDetected: mixedBuildStatus.detected,
        policyId: routePolicy.policyId,
        walletContextReady: walletRuntime.contextAvailable,
        walletRuntimeLoaded: walletRuntime.loaded,
        walletRuntimeRequestFailed: walletRuntime.failed,
        walletRuntimeRetryRequestAvailable: typeof walletRuntime.requestLoad === "function",
        chunkFailureCategory,
        fallbackAction: recoveryAction,
        recoveryRetryCount,
        routeRequiresWallet: routePolicy.requiresWallet,
        ...(missingSuiClientContext || missingDAppKitContext ? walletProviderDiagnostics : {}),
      },
    });
    console.error("DeepSignal route failed to render.", {
      error,
      routePath: this.props.routePath,
      routeId,
      pathname,
      hash,
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
      route: this.props.routePath,
      policyId: routePolicy.policyId,
      walletContextReady: walletRuntime.contextAvailable,
      walletRuntimeLoaded: walletRuntime.loaded,
      routeRequiresWallet: routePolicy.requiresWallet,
      walletUiEnabled: routePolicy.showWalletUi,
      walletUiRequested: routePolicy.showWalletUi,
      recoveryAction,
      recoveryRetryCount,
      chunkFailureCategory,
      componentStack: errorInfo.componentStack,
      failedImportDiagnostics,
      ...(missingSuiClientContext || missingDAppKitContext ? walletProviderDiagnostics : {}),
    });
    logRouteLifecycle("route:error-boundary", {
      routePath: this.props.routePath,
      policyId: routePolicy.policyId,
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
      routePolicyId: routePolicy.policyId,
      walletContextReady: walletRuntime.contextAvailable,
      walletRuntimeLoaded: walletRuntime.loaded,
      routeRequiresWallet: routePolicy.requiresWallet,
      walletUiEnabled: routePolicy.showWalletUi,
      walletUiRequested: routePolicy.showWalletUi,
      recoveryAction,
      recoveryRetryCount,
      route: this.props.routePath,
      componentStack: errorInfo.componentStack,
      ...(missingSuiClientContext || missingDAppKitContext ? walletProviderDiagnostics : {}),
    });
    logRouteLifecycle("route:error", {
      routePath: this.props.routePath,
      route: this.props.routePath,
      policyId: routePolicy.policyId,
      routeRequiresWallet: routePolicy.requiresWallet,
      walletContextReady: walletRuntime.contextAvailable,
      walletUiEnabled: routePolicy.showWalletUi,
      walletUiRequested: routePolicy.showWalletUi,
      retryCount: recoveryRetryCount,
      fallbackAction: recoveryAction,
      chunkFailureCategory,
    });
    if (mixedBuildStatus.detected) {
      logRouteLifecycle("mixed_build_assets_detected", {
        routePath: this.props.routePath,
        root: mixedBuildStatus.root,
        observed: mixedBuildStatus.observed,
        reason: mixedBuildStatus.reason,
      });
    }
    void loadRouteErrorDiagnosticsRuntime()
      .then(({ buildRouteErrorDiagnostics }) => {
        const diagnostics = buildRouteErrorDiagnostics({
          chunkRecovery: getChunkLoadRecoverySnapshot(),
          chunkUrl,
          componentStack: errorInfo.componentStack,
          error,
          failedImportDiagnostics,
          hash,
          mixedBuildStatus,
          pathname,
          routePath: this.props.routePath,
          userAgent,
        });
        if (diagnostics.routeId === "explore") {
          safeWriteLocalStorage(LAST_EXPLORE_ERROR_KEY, JSON.stringify(diagnostics, null, 2));
        }
        this.setState({ diagnostics, diagnosticsCopied: false });
      })
      .catch(() => {
        this.setState({ diagnostics: null, diagnosticsCopied: false });
      });
    if (!recoverFromMixedBuildAssets(mixedBuildStatus) && chunkRecovery.reachedLimit) {
      logRouteLifecycle("route:error-boundary", {
        route: this.props.routePath,
        policyId: routePolicy.policyId,
        event: "chunk-recovery-limit-reached",
        retryLimit: chunkRecovery.retryLimit,
        retryCount: chunkRecovery.retryCount,
        fallbackAction: recoveryAction,
        walletContextReady: walletRuntime.contextAvailable,
      });
    }
  }

  componentDidUpdate(prevProps: Readonly<{ children: ReactNode; resetKey: string; routePath: string; onRetryRoute: () => void }>) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ cacheClearMessage: "", error: null, diagnostics: null, diagnosticsCopied: false, liteModeContinued: false, retryCount: 0 });
    }
  }

  handleRetry = () => {
    const nextRetryCount = this.state.retryCount + 1;
    if (nextRetryCount >= 2) {
      clearChunkLoadRecoveryState();
      clearBuildAssetRecoveryState();
    }
    const routePolicy = getRouteRuntimeMetadata(this.props.routePath);
    const walletRuntime = getWalletProviderRuntimeSnapshot();

    logRouteLifecycle("route:error-boundary-retry", {
      routePath: this.props.routePath,
      policyId: routePolicy.policyId,
      route: this.props.routePath,
      retryCount: nextRetryCount,
      fallbackAction: "user-retry",
      walletContextReady: walletRuntime.contextAvailable,
      walletUiEnabled: routePolicy.showWalletUi,
      walletUiRequested: routePolicy.showWalletUi,
      clearedStaleRecoveryState: nextRetryCount >= 2,
      chunkFailure: isChunkLoadFailure(this.state.error),
    });
    this.props.onRetryRoute();
    this.setState({ cacheClearMessage: "", error: null, diagnostics: null, diagnosticsCopied: false, liteModeContinued: false, retryCount: nextRetryCount });
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

  handleClearRouteCache = async () => {
    this.setState({ clearingRouteCache: true, cacheClearMessage: "" });
    clearChunkLoadRecoveryState();
    clearBuildAssetRecoveryState();
    try {
      if (typeof window === "undefined" || !("caches" in window)) {
        this.setState({ cacheClearMessage: "Cache Storage is not available in this browser." });
        return;
      }
      const cacheNamesBefore = await window.caches.keys();
      const targets = cacheNamesBefore.filter((name) => name.toLowerCase().includes("deepsignal"));
      await Promise.all(targets.map((name) => window.caches.delete(name)));
      const cacheNamesAfter = await window.caches.keys();
      logRouteLifecycle("route:error-boundary-stale-cache-cleared", {
        routePath: this.props.routePath,
        removedCaches: targets,
        cacheNamesBefore,
        cacheNamesAfter,
      });
      this.setState({
        cacheClearMessage:
          targets.length > 0
            ? `Cleared ${targets.length} DeepSignal route cache${targets.length === 1 ? "" : "s"}.`
            : "No DeepSignal route caches were found.",
      });
    } catch (error) {
      this.setState({ cacheClearMessage: error instanceof Error ? error.message : "Unable to clear route cache." });
    } finally {
      this.setState({ clearingRouteCache: false });
    }
  }

  handleGoExplore = () => {
    if (typeof window !== "undefined") {
      window.location.assign("/#/explore");
    }
  }

  handleCopyDiagnostics = async () => {
    let diagnostics = this.state.diagnostics;
    if (!diagnostics) {
      const pathname = typeof window === "undefined" ? this.props.routePath.split(/[?#]/)[0] || "/" : window.location.pathname;
      const hash = typeof window === "undefined" ? "" : window.location.hash;
      const chunkUrl = getChunkFailureUrl(this.state.error) ?? getLastFailedImportChunkUrl();
      const userAgent = typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
      const mixedBuildStatus = {
        detected: false,
        observed: [] as BuildAssetRecord[],
        root: {
          source: "root",
          appVersion: buildInfo.appVersion,
          buildTime: buildInfo.buildTime,
          gitHash: buildInfo.gitHash,
          recordedAt: new Date().toISOString(),
        },
      };
      try {
        const { buildRouteErrorDiagnostics } = await loadRouteErrorDiagnosticsRuntime();
        diagnostics = buildRouteErrorDiagnostics({
          chunkRecovery: getChunkLoadRecoverySnapshot(),
          chunkUrl,
          componentStack: "",
          error: this.state.error,
          failedImportDiagnostics: getRecentFailedImportDiagnostics(),
          hash,
          mixedBuildStatus,
          pathname,
          routePath: this.props.routePath,
          userAgent,
        });
        this.setState({ diagnostics });
      } catch {
        diagnostics = null;
      }
    }
    const diagnosticsText = JSON.stringify(
      diagnostics ?? {
        errorName: this.state.error?.name ?? "unknown",
        errorMessage: this.state.error?.message ?? "unknown",
        routePath: this.props.routePath,
        routeId: getRouteId(this.props.routePath),
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
      const failedImportDiagnostics = diagnostics?.failedImportDiagnostics ?? getRecentFailedImportDiagnostics();
      const latestFailedImport = failedImportDiagnostics[failedImportDiagnostics.length - 1];
      const dependencyFailures = latestFailedImport?.dependencyProbe?.dependencies.filter((probe) => !probe.ok) ?? [];
      const routeId = diagnostics?.routeId ?? getRouteId(this.props.routePath);
      const showDiagnostics = Boolean(diagnostics) || chunkFailure || shouldShowRouteDiagnostics(this.props.routePath);
      const missingExport = latestFailedImport?.category === "missingExport" || this.state.error.name === "MissingLazyRouteExportError";
      const appShellTimeout = routeId === "admin" && latestFailedImport?.label === "app-shell" && latestFailedImport.category === "timeout";
      const missingWalletContext = /DAppKitContext|Could not find DAppKit|Could not find SuiClientContext/i.test(this.state.error.message);
      const assetMismatch = missingExport || Boolean(diagnostics?.mixedBuildAssetsDetected);
      const headline =
        chunkFailure || assetMismatch
          ? "App assets out of sync."
          : "We couldn't reopen this workspace yet. Your local signals are still preserved.";

      if (appShellTimeout || missingWalletContext) {
        return (
          <Suspense
            fallback={
              <div className="panel glow-panel route-status-panel" role="alert">
                <p className="muted">Preparing dashboard recovery</p>
              </div>
            }
          >
            <DashboardDegradedShell
              onContinueLiteMode={() => {
                logRouteLifecycle("dashboard:continue-lite-mode", {
                  routePath: this.props.routePath,
                  retryCount: this.state.retryCount,
                });
                this.setState({ liteModeContinued: true });
              }}
              onRetryImports={this.handleRetry}
              primaryActionLabel="Retry AppShell"
              routePath={this.props.routePath}
              statusMessage={
                missingWalletContext
                  ? "Wallet runtime is still deferred on this device. DeepSignal is keeping the workspace shell active while wallet-only controls stay hidden."
                  : this.state.liteModeContinued
                  ? "Dashboard is staying in Lite Mode. Local fallback data remains preserved while wallet-heavy chrome stays deferred."
                  : "AppShell failed to load on this device. Dashboard Lite Mode is available while the wallet-heavy shell remains deferred."
              }
              statusTitle={
                missingWalletContext
                  ? "Wallet runtime still loading"
                  : this.state.liteModeContinued
                    ? "Dashboard Lite Mode active"
                    : "AppShell failed to load on this device"
              }
            />
          </Suspense>
        );
      }

      return (
        <div className="panel glow-panel route-status-panel" role="alert">
          <p className="eyebrow">Signal surface</p>
          <h1>{headline}</h1>
          <p className="muted">
            {chunkFailure
              ? "A route chunk could not be loaded, usually because Safari has an older asset cached while a newer build is active. Local fallback data is still preserved."
              : assetMismatch
                ? "A route module loaded with an unexpected export shape, usually because Safari has stale or mixed app assets cached. Local fallback data is still preserved."
              : "Retry the route to restore the workspace. Local fallback data is still preserved."}
          </p>
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={() => void this.handleHardRefresh()}>
              Refresh app assets
            </button>
            <button type="button" className="ghost-button" onClick={this.handleRetry}>
              {this.state.retryCount === 0 ? "Retry route import" : "Retry after clearing stale markers"}
            </button>
            <button type="button" className="ghost-button" onClick={this.handleGoExplore}>
              Go to Explore
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => void this.handleClearRouteCache()}
              disabled={this.state.clearingRouteCache}
            >
              {this.state.clearingRouteCache ? "Clearing route cache..." : "Clear stale route cache"}
            </button>
            <button type="button" className="ghost-button" onClick={() => void this.handleCopyDiagnostics()}>
              {this.state.diagnosticsCopied ? "Copied diagnostics" : "Copy diagnostics"}
            </button>
          </div>
          {this.state.cacheClearMessage ? <p className="muted">{this.state.cacheClearMessage}</p> : null}
          {missingExport ? (
            <Suspense fallback={null}>
              <LocalRecoveryCenter />
            </Suspense>
          ) : null}
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
                <dt>available exports</dt>
                <dd>{latestFailedImport?.availableExports?.join(", ") || latestFailedImport?.moduleKeys?.join(", ") || "n/a"}</dd>
                <dt>module type</dt>
                <dd>{latestFailedImport?.moduleType ?? "n/a"}</dd>
                <dt>has default export</dt>
                <dd>{latestFailedImport?.hasDefaultExport === undefined ? "n/a" : latestFailedImport.hasDefaultExport ? "yes" : "no"}</dd>
                <dt>route label</dt>
                <dd>{latestFailedImport?.routeLabel ?? "n/a"}</dd>
                <dt>route key</dt>
                <dd>{latestFailedImport?.routeKey ?? "n/a"}</dd>
                <dt>import URL</dt>
                <dd>{latestFailedImport?.importTargetUrl ?? "n/a"}</dd>
                <dt>retry import URL</dt>
                <dd>{latestFailedImport?.retryImportUrl ?? "n/a"}</dd>
                <dt>mobile Safari</dt>
                <dd>{latestFailedImport?.mobileSafari === undefined ? "n/a" : latestFailedImport.mobileSafari ? "yes" : "no"}</dd>
                <dt>current URL</dt>
                <dd>{latestFailedImport?.currentUrl ?? "n/a"}</dd>
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
