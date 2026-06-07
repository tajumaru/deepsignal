import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useWalletProviderRuntime } from "./WalletSurfaceRuntime";
import { WalletNav } from "./WalletNav";
import { useDashboardProjectRestoreSnapshot } from "../lib/dashboardProjectRestore";
import { retryLazyImport } from "../lib/lazyRetry";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { useOptionalWalletConnection } from "../walletStatus";
import { SafeLazyBoundary } from "./SafeLazyBoundary";

type WalletRuntimePanelProps =
  | {
      mode: "nav";
      onNavigate?: () => void;
      section: "access" | "inbox";
    }
  | {
      mode: "connect";
      fallback?: ReactNode;
      interaction?: "default" | "passive";
      surface?: "mobileDrawer";
    };

export interface WalletConnectRuntimeStatus {
  accountAddress: string | null;
  connectMode: "manual" | "autoRestore" | null;
  openState: "closed" | "connected" | "passive";
  projectRestoreState: string;
  selectedProjectId: string;
  walletConnectedState: "connected" | "disconnected";
  walletProviderState: "connecting" | "disconnected" | "connected";
}

function WalletRuntimePanelConnectFallback({ fallback }: { fallback?: ReactNode }) {
  if (fallback) {
    return <>{fallback}</>;
  }
  return <div className="wallet-connect-shell wallet-connect-shell-compact" aria-hidden="true" />;
}

function WalletRuntimePanelImportFallback({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="wallet-connect-shell wallet-connect-shell-compact">
      <div className="wallet-connect-direct panel">
        <div className="wallet-connect-direct-copy">
          <strong>Wallet panel could not load</strong>
          <span>Retry only the wallet panel. Dashboard content stays available.</span>
        </div>
        <div className="wallet-connect-actions">
          <button type="button" className="wallet-connect-trigger" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WalletRuntimePanel(props: WalletRuntimePanelProps) {
  const location = useLocation();
  const walletConnection = useOptionalWalletConnection();
  const walletRuntime = useWalletProviderRuntime();
  const dashboardRestore = useDashboardProjectRestoreSnapshot();
  const [walletSurfaceRetryNonce, setWalletSurfaceRetryNonce] = useState(0);
  const connectInteraction = props.mode === "connect" ? props.interaction : "default";
  const isEmptyDashboardState =
    location.pathname === "/dashboard" &&
    dashboardRestore.state === "ready_without_project" &&
    dashboardRestore.currentProjectId === "";
  const runtimeStatus = useMemo<WalletConnectRuntimeStatus>(
    () => ({
      accountAddress: walletConnection.accountAddress,
      connectMode: walletConnection.connectMode,
      openState:
        walletConnection.accountAddress
          ? "connected"
          : props.mode === "connect" && connectInteraction === "passive" && isEmptyDashboardState
            ? "passive"
            : "closed",
      projectRestoreState: isEmptyDashboardState ? dashboardRestore.state : "n/a",
      selectedProjectId: isEmptyDashboardState ? dashboardRestore.currentProjectId : "",
      walletConnectedState: walletConnection.accountAddress ? "connected" : "disconnected",
      walletProviderState: walletConnection.status,
    }),
    [
      dashboardRestore.currentProjectId,
      dashboardRestore.state,
      connectInteraction,
      isEmptyDashboardState,
      props.mode,
      walletConnection.accountAddress,
      walletConnection.connectMode,
      walletConnection.status,
    ],
  );
  const previousRuntimeStatusRef = useRef<WalletConnectRuntimeStatus | null>(null);
  const LazyWalletConnectSurface = useMemo(
    () =>
      lazy(() =>
        retryLazyImport(() => import("./WalletConnectSurface"), "wallet-runtime-connect-surface").then((module) => ({
          default: module.WalletConnectSurface,
        })),
      ),
    [],
  );

  useEffect(() => {
    const previous = previousRuntimeStatusRef.current;
    logRouteLifecycle("wallet-runtime-panel:render", {
      accountAddress: runtimeStatus.accountAddress ? "present" : "absent",
      connectMode: runtimeStatus.connectMode,
      nextConnectMode: runtimeStatus.connectMode,
      nextOpenState: runtimeStatus.openState,
      nextWalletConnectedState: runtimeStatus.walletConnectedState,
      openState: previous?.openState ?? runtimeStatus.openState,
      previousAccountAddress: previous?.accountAddress ? "present" : "absent",
      previousConnectMode: previous?.connectMode ?? null,
      previousOpenState: previous?.openState ?? null,
      previousWalletConnectedState: previous?.walletConnectedState ?? null,
      projectRestoreState: runtimeStatus.projectRestoreState,
      providerLoaded: walletRuntime.loaded,
      selectedProjectId: runtimeStatus.selectedProjectId,
      walletConnectedState: runtimeStatus.walletConnectedState,
      walletProvider: runtimeStatus.walletProviderState,
    });
    previousRuntimeStatusRef.current = runtimeStatus;
  }, [runtimeStatus, walletRuntime.loaded]);

  if (props.mode === "nav") {
    return <WalletNav section={props.section} onNavigate={props.onNavigate} />;
  }

  return (
    <SafeLazyBoundary
      fallback={
        <WalletRuntimePanelImportFallback
          onRetry={() => {
            setWalletSurfaceRetryNonce((value) => value + 1);
          }}
        />
      }
      onError={(error, errorInfo) => {
        logRouteLifecycle("wallet-ui-lazy-failure-contained", {
          label: "wallet-runtime-connect-surface",
          componentStack: errorInfo.componentStack,
          error,
          fatal: false,
          routePath: location.pathname,
        });
      }}
      resetKey={`wallet-surface:${walletSurfaceRetryNonce}`}
    >
      <Suspense fallback={<WalletRuntimePanelConnectFallback fallback={props.fallback} />}>
        <LazyWalletConnectSurface
          compact
          surface={props.surface}
          fallback={props.fallback}
          passiveUntilRequested={connectInteraction === "passive" && isEmptyDashboardState}
          runtimeStatus={runtimeStatus}
        />
      </Suspense>
    </SafeLazyBoundary>
  );
}

export function WalletRuntimeNavSlot({
  onNavigate,
  section,
}: Extract<WalletRuntimePanelProps, { mode: "nav" }>) {
  return <WalletRuntimePanel mode="nav" section={section} onNavigate={onNavigate} />;
}

export function WalletRuntimeConnectSlot({
  fallback,
  interaction,
  surface,
}: Extract<WalletRuntimePanelProps, { mode: "connect" }>) {
  return <WalletRuntimePanel mode="connect" surface={surface} fallback={fallback} interaction={interaction} />;
}
