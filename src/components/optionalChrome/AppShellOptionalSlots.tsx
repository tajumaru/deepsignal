import { Link, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import type { WalletSessionPhase } from "../../walletSessionState";
import { retryLazyImport } from "../../lib/lazyRetry";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle } from "../../lib/routeDiagnostics";
import { scheduleIdleTask } from "../../lib/scheduleIdleTask";
import { OptionalHeaderWidget } from "./OptionalHeaderWidget";

type OptionalHeaderComponentModule = {
  default: ComponentType<Record<string, unknown>>;
};

function SafeWalletPlaceholder({ surface }: { surface?: "mobileDrawer" }) {
  if (surface === "mobileDrawer") {
    return (
      <div className="mobile-drawer-status-line" aria-live="polite">
        <span className="mobile-drawer-status-dot" aria-hidden="true" />
        <span>Preparing secure session</span>
      </div>
    );
  }

  return (
    <div className="wallet-connect-shell wallet-connect-shell-compact">
      <div className="wallet-connect-direct panel">
        <div className="wallet-connect-direct-copy">
          <strong>Preparing secure session</strong>
          <span>Wallet runtime is still mounting.</span>
        </div>
        <button type="button" className="wallet-connect-trigger" disabled aria-disabled="true">
          Wallet loading...
        </button>
      </div>
    </div>
  );
}

function WalletUiUnavailableFallback({
  onRetry,
  surface,
}: {
  onRetry: () => void;
  surface?: "mobileDrawer";
}) {
  if (surface === "mobileDrawer") {
    return (
      <div className="mobile-drawer-status-line" aria-live="polite">
        <span className="mobile-drawer-status-dot" aria-hidden="true" />
        <span>Wallet panel could not load.</span>
        <button type="button" className="wallet-connect-dismiss" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-connect-shell wallet-connect-shell-compact">
      <div className="wallet-connect-direct panel">
        <div className="wallet-connect-direct-copy">
          <strong>Wallet panel could not load</strong>
          <span>Retry only the wallet area. Dashboard content stays available.</span>
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

function WalletNavFallback({
  navLabLabel,
  onNavigate,
  section,
}: {
  navLabLabel: string;
  onNavigate?: () => void;
  section: "access" | "inbox";
}) {
  if (section !== "inbox") {
    return null;
  }

  return (
    <Link to="/admin" onClick={onNavigate}>
      {navLabLabel}
    </Link>
  );
}

function useOptionalHeaderStateLog(
  event: "optional-header-widget:deferred" | "optional-header-widget:skipped",
  enabled: boolean,
  details: {
    label: string;
    reason: string;
    routePath: string;
    surface?: "mobileDrawer";
    walletProviderMounted?: boolean;
    walletProviderPending?: boolean;
    walletSessionPhase?: WalletSessionPhase;
  },
) {
  const {
    label,
    reason,
    routePath,
    surface,
    walletProviderMounted,
    walletProviderPending,
    walletSessionPhase,
  } = details;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    logRouteLifecycle(event, {
      label,
      reason,
      routePath,
      surface,
      walletProviderMounted,
      walletProviderPending,
      walletSessionPhase,
    });
  }, [
    enabled,
    event,
    label,
    reason,
    routePath,
    surface,
    walletProviderMounted,
    walletProviderPending,
    walletSessionPhase,
  ]);
}

export function WalletNavSlot({
  navLabLabel,
  onNavigate,
  section,
  walletUiEnabled,
  walletUiRequested,
}: {
  navLabLabel: string;
  onNavigate?: () => void;
  section: "access" | "inbox";
  walletUiEnabled: boolean;
  walletUiRequested: boolean;
}) {
  const location = useLocation();
  const staticFallback = <WalletNavFallback navLabLabel={navLabLabel} onNavigate={onNavigate} section={section} />;

  useOptionalHeaderStateLog("optional-header-widget:skipped", true, {
    label: "wallet-runtime-nav",
    reason: !walletUiRequested ? "wallet-ui-not-requested" : walletUiEnabled ? "static-nav" : "wallet-ui-disabled",
    routePath: location.pathname,
  });

  return staticFallback;
}

export function WalletConnectSlot({
  fallback,
  interaction = "default",
  routeReady,
  surface,
  walletProviderMounted,
  walletProviderPending,
  walletSessionPhase,
  walletHydrationReady,
  walletUiEnabled,
  walletUiRequested,
}: {
  fallback?: ReactNode;
  interaction?: "default" | "passive";
  routeReady: boolean;
  surface?: "mobileDrawer";
  walletProviderMounted: boolean;
  walletProviderPending: boolean;
  walletSessionPhase: WalletSessionPhase;
  walletHydrationReady: boolean;
  walletUiEnabled: boolean;
  walletUiRequested: boolean;
}) {
  const location = useLocation();
  const [retryNonce, setRetryNonce] = useState(0);
  const walletUiSkipped = !walletUiRequested;
  const walletUiDeferred =
    !walletUiSkipped &&
    (
      !routeReady ||
      !walletUiEnabled ||
      !walletHydrationReady
    );
  const deferredReason =
    !routeReady
      ? "route-not-ready"
      : !walletUiEnabled
      ? "wallet-ui-disabled"
      : "wallet-hydration-pending";
  const walletRuntimePanelLoader = useCallback(
    () =>
      retryLazyImport(() => import("../WalletRuntimePanel"), "wallet-runtime-panel").then((module) => ({
        default: module.default as ComponentType<Record<string, unknown>>,
      }) satisfies OptionalHeaderComponentModule),
    [],
  );
  const fallbackNode = useMemo(
    () => <WalletUiUnavailableFallback onRetry={() => setRetryNonce((value) => value + 1)} surface={surface} />,
    [surface],
  );
  useOptionalHeaderStateLog("optional-header-widget:skipped", walletUiSkipped, {
    label: "wallet-runtime-panel",
    reason: "wallet-ui-not-requested",
    routePath: location.pathname,
    surface,
  });
  useOptionalHeaderStateLog("optional-header-widget:deferred", walletUiDeferred, {
    label: "wallet-runtime-panel",
    reason: deferredReason,
    routePath: location.pathname,
    surface,
    walletProviderMounted,
    walletProviderPending,
    walletSessionPhase,
  });

  if (walletUiSkipped) {
    return null;
  }

  if (walletUiDeferred) {
    return <SafeWalletPlaceholder surface={surface} />;
  }

  return (
    <OptionalHeaderWidget
      componentProps={{ mode: "connect", surface, fallback, interaction }}
      fallback={fallbackNode}
      label="wallet-runtime-panel"
      loader={walletRuntimePanelLoader}
      onError={(error: unknown, errorInfo: ErrorInfo) => {
        logRouteLifecycle("wallet-ui-lazy-failure-contained", {
          label: "wallet-runtime-panel",
          componentStack: errorInfo.componentStack,
          error,
          fatal: false,
          routePath: location.pathname,
        });
      }}
      resetKey={`wallet-runtime-panel:connect:${retryNonce}:${location.pathname}`}
    />
  );
}

export function DeferredNetworkMenu({ drawerFallback = false, routeReady }: { drawerFallback?: boolean; routeReady: boolean }) {
  const [ready, setReady] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const location = useLocation();
  const networkMenuDeferred = !routeReady || !ready;
  const networkMenuLoader = useCallback(
    () =>
      retryLazyImport(() => import("../NetworkMenu"), "network-menu").then((module) => ({
        default: module.NetworkMenu as ComponentType<Record<string, unknown>>,
      }) satisfies OptionalHeaderComponentModule),
    [],
  );

  useEffect(() => scheduleIdleTask(() => setReady(true), getBrowserCapabilitiesSnapshot().mobileSafari ? 3200 : 2200), []);
  useOptionalHeaderStateLog("optional-header-widget:deferred", networkMenuDeferred, {
    label: "network-menu",
    reason: !routeReady ? "route-not-ready" : "idle-deferred",
    routePath: location.pathname,
  });

  if (networkMenuDeferred) {
    if (drawerFallback) {
      return (
        <div className="mobile-drawer-status-line" aria-live="polite">
          <span className="mobile-drawer-status-dot" aria-hidden="true" />
          <span>{ready ? "Local signal mode" : "Loading network controls"}</span>
        </div>
      );
    }

    return <div className="network-select-shell network-select-shell-placeholder" aria-hidden="true" />;
  }

  const fallback = drawerFallback ? (
    <div className="mobile-drawer-status-line" aria-live="polite">
      <span className="mobile-drawer-status-dot" aria-hidden="true" />
      <span>Network controls could not load.</span>
      <button type="button" className="wallet-connect-dismiss" onClick={() => setRetryNonce((value) => value + 1)}>
        Retry
      </button>
    </div>
  ) : (
    <div className="network-select-shell network-select-shell-placeholder" aria-hidden="true" />
  );

  return (
    <OptionalHeaderWidget
      fallback={fallback}
      label="network-menu"
      loader={networkMenuLoader}
      onError={(error: unknown, errorInfo: ErrorInfo) => {
        logRouteLifecycle("wallet-ui-lazy-failure-contained", {
          label: "network-menu",
          componentStack: errorInfo.componentStack,
          error,
          fatal: false,
          routePath: location.pathname,
        });
      }}
      resetKey={`network-menu:${retryNonce}:${location.pathname}`}
    />
  );
}
