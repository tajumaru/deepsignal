import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import type { WalletSessionPhase } from "../../walletSessionState";
import { retryLazyImport } from "../../lib/lazyRetry";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle } from "../../lib/routeDiagnostics";
import { scheduleIdleTask } from "../../lib/scheduleIdleTask";
import { useOptionalRpcInfrastructure } from "../../rpcInfrastructure";
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

  if (!walletUiRequested || !walletUiEnabled) {
    return <WalletNavFallback navLabLabel={navLabLabel} onNavigate={onNavigate} section={section} />;
  }

  return (
    <OptionalHeaderWidget
      componentProps={{ mode: "nav", onNavigate, section }}
      fallback={<WalletNavFallback navLabLabel={navLabLabel} onNavigate={onNavigate} section={section} />}
      label="wallet-runtime-panel"
      loader={() =>
        retryLazyImport(() => import("../WalletRuntimePanel"), "wallet-runtime-panel").then((module) => ({
          default: module.default as ComponentType<Record<string, unknown>>,
        }) satisfies OptionalHeaderComponentModule)
      }
      onError={(error: unknown, errorInfo: ErrorInfo) => {
        logRouteLifecycle("wallet-ui-lazy-failure-contained", {
          label: "wallet-runtime-panel",
          componentStack: errorInfo.componentStack,
          error,
          fatal: false,
          routePath: location.pathname,
        });
      }}
      resetKey={`wallet-runtime-panel:nav:${section}:${location.pathname}`}
    />
  );
}

export function WalletConnectSlot({
  fallback,
  interaction = "default",
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

  if (!walletUiRequested) {
    return null;
  }

  if (
    !walletUiEnabled ||
    !walletProviderMounted ||
    walletProviderPending ||
    walletSessionPhase === "provider_deferred" ||
    !walletHydrationReady
  ) {
    return <SafeWalletPlaceholder surface={surface} />;
  }

  return (
    <OptionalHeaderWidget
      componentProps={{ mode: "connect", surface, fallback, interaction }}
      fallback={<WalletUiUnavailableFallback onRetry={() => setRetryNonce((value) => value + 1)} surface={surface} />}
      label="wallet-runtime-panel"
      loader={() =>
        retryLazyImport(() => import("../WalletRuntimePanel"), "wallet-runtime-panel").then((module) => ({
          default: module.default as ComponentType<Record<string, unknown>>,
        }) satisfies OptionalHeaderComponentModule)
      }
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

export function DeferredNetworkMenu({ drawerFallback = false }: { drawerFallback?: boolean }) {
  const [ready, setReady] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const rpcInfrastructure = useOptionalRpcInfrastructure();
  const location = useLocation();

  useEffect(() => scheduleIdleTask(() => setReady(true), getBrowserCapabilitiesSnapshot().mobileSafari ? 3200 : 2200), []);

  if (!ready || !rpcInfrastructure) {
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
      loader={() =>
        retryLazyImport(() => import("../NetworkMenu"), "network-menu").then((module) => ({
          default: module.NetworkMenu as ComponentType<Record<string, unknown>>,
        }) satisfies OptionalHeaderComponentModule)
      }
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
