import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import "../styles/components/wallet-network.css";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { retryLazyImport, suppressStaleLazyImport } from "../lib/lazyRetry";
import { copyRouteLifecycleDiagnosticsToClipboard, getBrowserCapabilitiesSnapshot, logRouteLifecycle } from "../lib/routeDiagnostics";
import { shortAddress } from "../lib/sui";
import { hadPriorWalletConnectChunkFailure, reloadWalletConnectRuntimeForRetry } from "../lib/walletConnectRuntimeRecovery";
import { resetWalletSession } from "../lib/walletSessionReset";
import { useRouteRecoveryState } from "../lib/routeRecoveryState";
import { useWalletRuntimeControls } from "../walletStatus";
import type { WalletConnectFailureState } from "../walletStatus";
import { useWalletProviderReset } from "../walletProviderReset";
import { useWalletProviderRuntime } from "./WalletSurfaceRuntime";
import type { WalletConnectRuntimeStatus } from "./WalletRuntimePanel";
import { WalletStatus } from "./wallet/WalletStatus";

function openSlushConnectionGuide() {
  if (typeof window === "undefined") {
    return;
  }
  window.alert(
    "Open Slush, remove the old DeepSignal connection, then return here and try again.",
  );
}

function tryOpenSlushApp() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.location.assign("slush://");
  } catch {
    openSlushConnectionGuide();
  }
}

const WalletConnect = lazy(() =>
  suppressStaleLazyImport(
    retryLazyImport(() => import("./WalletConnect"), "wallet-connect").then((module) => ({ default: module.WalletConnect })),
    "wallet-connect",
  ),
);
const LazySuiAddressDisplay = lazy(() =>
  suppressStaleLazyImport(
    retryLazyImport(() => import("./SuiAddressDisplay"), "wallet-connect-address-display").then((module) => ({
      default: module.SuiAddressDisplay,
    })),
    "wallet-connect-address-display",
  ),
);
const LazyConnectedWalletMenu = lazy(() =>
  suppressStaleLazyImport(
    retryLazyImport(() => import("./wallet/ConnectedWalletMenu"), "wallet-connect-menu").then((module) => ({
      default: module.ConnectedWalletMenu,
    })),
    "wallet-connect-menu",
  ),
);

interface WalletConnectSurfaceProps {
  compact?: boolean;
  context?: "default" | "adminGate";
  fallback?: ReactNode;
  passiveUntilRequested?: boolean;
  runtimeStatus?: WalletConnectRuntimeStatus;
  surface?: "default" | "mobileDrawer";
}

class WalletConnectImportBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
    onError: (error: unknown, errorInfo: ErrorInfo) => void;
    resetKey: string;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    this.props.onError(error, errorInfo);
  }

  componentDidUpdate(previousProps: Readonly<{ resetKey: string }>) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function WalletConnectFallback({ compact = false }: { compact?: boolean }) {
  return <div className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""}`.trim()} />;
}

function WalletAddressFallback({
  address,
  onPress,
}: {
  address: string;
  onPress: () => void;
}) {
  return (
    <span className="sui-address-display-shell wallet-sync-address-shell">
      <button
        type="button"
        className="sui-address-display"
        onClick={onPress}
        title={address}
        aria-label={`Open wallet menu for ${address}`}
      >
        <span className="sui-address-display-label wallet-sync-address">{shortAddress(address)}</span>
      </button>
    </span>
  );
}

function ConnectedWalletMenuFallback() {
  return <div className="wallet-sync-menu panel" aria-hidden="true" />;
}

export function WalletConnectSurface({
  compact = false,
  context = "default",
  fallback,
  passiveUntilRequested = false,
  runtimeStatus,
  surface = "default",
}: WalletConnectSurfaceProps) {
  const { t } = useI18n();
  const wallet = useSuiWallet();
  const { beginManualConnect, cancelManualConnect, clearConnectFailure, suppressAutoRestore } = useWalletRuntimeControls();
  const { remountWalletProvider } = useWalletProviderReset();
  const walletRuntime = useWalletProviderRuntime();
  const routeRecovery = useRouteRecoveryState();
  const [connectRequested, setConnectRequested] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [interactiveRequested, setInteractiveRequested] = useState(false);
  const [pendingConnectOpen, setPendingConnectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [walletConnectImportFailed, setWalletConnectImportFailed] = useState(false);
  const [walletConnectImportResetNonce, setWalletConnectImportResetNonce] = useState(0);
  const [connectFailureOverride, setConnectFailureOverride] = useState<WalletConnectFailureState | null>(null);
  const manualConnectLockRef = useRef(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const previousDiagnosticsRef = useRef<{
    accountAddress: string | null;
    connectMode: "manual" | "autoRestore" | null;
    openState: boolean;
    walletConnectedState: "connected" | "disconnected";
  } | null>(null);
  const previousEffectDiagnosticsRef = useRef<{
    accountAddress: string | null;
    connectMode: "manual" | "autoRestore" | null;
    openState: boolean;
    walletConnectedState: "connected" | "disconnected";
  } | null>(null);
  const isMobileDrawer = surface === "mobileDrawer";
  const isAdminGate = context === "adminGate";
  const accountAddress = runtimeStatus?.accountAddress ?? wallet.accountAddress ?? null;
  const walletConnectedState = runtimeStatus?.walletConnectedState ?? (accountAddress ? "connected" : "disconnected");
  const connectMode = runtimeStatus?.connectMode ?? wallet.connectMode ?? null;
  const disconnectedWithoutAccount = walletConnectedState === "disconnected" && !accountAddress;
  const passiveShellActive = passiveUntilRequested && disconnectedWithoutAccount && !interactiveRequested;
  const hasPendingConnectRequest = connectRequested || pendingConnectOpen || connectModalOpen;
  const providerLoadFailed = !walletRuntime.loaded && walletRuntime.failed && hasPendingConnectRequest;
  const waitingForProviderOpen = !walletRuntime.loaded && walletRuntime.loading && hasPendingConnectRequest;
  const hadChunkPreloadFailure = hadPriorWalletConnectChunkFailure();
  const routeRecoveryActive = routeRecovery.phase !== "idle";
  const displayedConnectFailure = connectFailureOverride ?? wallet.lastConnectFailure;
  const showInlineSlushRecovery = Boolean(displayedConnectFailure?.requiresSlushRecovery && !connectModalOpen);
  const manualConnectPendingUi =
    !displayedConnectFailure &&
    !accountAddress &&
    (hasPendingConnectRequest || wallet.connectLockState === "manual_connecting" || wallet.connectMode === "manual");
  const showStandbyState =
    waitingForProviderOpen ||
    manualConnectPendingUi ||
    wallet.status === "booting" ||
    wallet.status === "provider_pending" ||
    wallet.status === "connecting";
  const shellClassName = `wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""} ${
    isMobileDrawer ? "wallet-connect-shell-drawer" : ""
  }`.trim();

  const resetConnectRequest = useCallback(() => {
    manualConnectLockRef.current = false;
    setConnectRequested((current) => (current ? false : current));
    setPendingConnectOpen((current) => (current ? false : current));
    setConnectModalOpen((current) => (current ? false : current));
  }, []);

  async function handleResetWalletSession() {
    setResetPending(true);
    try {
      await resetWalletSession({
        onBeforeReload: () => {
          resetConnectRequest();
          cancelManualConnect();
          suppressAutoRestore();
          clearConnectFailure();
          setConnectFailureOverride(null);
        },
      });
    } finally {
      setResetPending(false);
    }
  }

  async function handleHardResetWalletSession() {
    setResetPending(true);
    try {
      await resetWalletSession({
        onBeforeReload: () => {
          resetConnectRequest();
          cancelManualConnect();
          suppressAutoRestore();
          clearConnectFailure();
          setConnectFailureOverride(null);
          setWalletConnectImportFailed(false);
          setWalletConnectImportResetNonce((value) => value + 1);
        },
        disconnectWallet: wallet.disconnect,
      });
      remountWalletProvider();
    } finally {
      setResetPending(false);
    }
  }

  async function handleManualConnectRequest() {
    if (wallet.isConnecting || resetPending || connectModalOpen || manualConnectLockRef.current) {
      return;
    }
    if (passiveUntilRequested && !interactiveRequested) {
      setInteractiveRequested(true);
    }
    if (routeRecoveryActive) {
      logRouteLifecycle("wallet-connect-attempted-during-route-recovery", {
        connectLockState: wallet.connectLockState,
        cssAssetError: routeRecovery.cssAssetError,
        failedChunkUrl: routeRecovery.failedChunkUrl,
        pendingLabels: routeRecovery.pendingLabels,
        routeImportState: routeRecovery.phase,
      });
      return;
    }
    manualConnectLockRef.current = true;

    beginManualConnect();
    clearConnectFailure();
    setConnectFailureOverride(null);

    if (wallet.isRestoringConnection) {
      suppressAutoRestore();
    }

    if (getBrowserCapabilitiesSnapshot().mobileSafari && hadChunkPreloadFailure) {
      await reloadWalletConnectRuntimeForRetry();
    }

    if (walletConnectImportFailed) {
      setWalletConnectImportFailed(false);
      setWalletConnectImportResetNonce((value) => value + 1);
    }

    logRouteLifecycle("wallet-connect-manual-open", {
      connectLockState: wallet.connectLockState,
      connectMode: "manual",
      hadChunkPreloadFailure,
      providerLoaded: walletRuntime.loaded,
    });

    if (!walletRuntime.loaded) {
      walletRuntime.requestLoad();
      setConnectRequested(true);
      setPendingConnectOpen(true);
      return;
    }

    setConnectRequested(true);
    setConnectModalOpen(true);
  }

  function handleConnectFailureRetry() {
    resetConnectRequest();
    cancelManualConnect();
    clearConnectFailure();
    setConnectFailureOverride(null);
    void handleManualConnectRequest();
  }

  function handleConnectModalOpenChange(open: boolean) {
    if (!open && !accountAddress) {
      return;
    }
    if (connectModalOpen !== open) {
      setConnectModalOpen(open);
    }
    if (!open && wallet.status !== "connected" && !wallet.isConnecting) {
      resetConnectRequest();
      cancelManualConnect();
    }
  }

  useEffect(() => {
    const previous = previousDiagnosticsRef.current;
    previousDiagnosticsRef.current = {
      accountAddress,
      connectMode,
      openState: hasPendingConnectRequest,
      walletConnectedState,
    };
    logRouteLifecycle("wallet-connect-surface:render", {
      accountAddress: accountAddress ? "present" : "absent",
      connectMode,
      nextConnectMode: connectMode,
      nextOpenState: hasPendingConnectRequest,
      nextWalletConnectedState: walletConnectedState,
      openState: previous?.openState ?? hasPendingConnectRequest,
      passiveShellActive,
      previousAccountAddress: previous?.accountAddress ? "present" : "absent",
      previousConnectMode: previous?.connectMode ?? null,
      previousOpenState: previous?.openState ?? null,
      previousWalletConnectedState: previous?.walletConnectedState ?? null,
      walletConnectedState,
      walletProvider: runtimeStatus?.walletProviderState ?? wallet.status,
    });
  }, [
    accountAddress,
    connectMode,
    hasPendingConnectRequest,
    passiveShellActive,
    runtimeStatus?.walletProviderState,
    wallet.status,
    walletConnectedState,
  ]);

  useEffect(() => {
    const previous = previousEffectDiagnosticsRef.current;
    logRouteLifecycle("wallet-connect-surface:effect", {
      accountAddress: accountAddress ? "present" : "absent",
      connectMode,
      nextConnectMode: connectMode,
      nextOpenState: hasPendingConnectRequest,
      nextWalletConnectedState: walletConnectedState,
      openState: previous?.openState ?? hasPendingConnectRequest,
      passiveShellActive,
      previousAccountAddress: previous?.accountAddress ? "present" : "absent",
      previousConnectMode: previous?.connectMode ?? null,
      previousOpenState: previous?.openState ?? null,
      previousWalletConnectedState: previous?.walletConnectedState ?? null,
      walletConnectedState,
      walletProvider: runtimeStatus?.walletProviderState ?? wallet.status,
    });
    previousEffectDiagnosticsRef.current = {
      accountAddress,
      connectMode,
      openState: hasPendingConnectRequest,
      walletConnectedState,
    };

    if (wallet.status === "connected") {
      setConnectFailureOverride(null);
      resetConnectRequest();
      return;
    }

    if (displayedConnectFailure) {
      cancelManualConnect();
      return;
    }

    if (disconnectedWithoutAccount && !pendingConnectOpen) {
      return;
    }

    if (pendingConnectOpen && walletRuntime.loaded && !connectModalOpen) {
      setConnectModalOpen((current) => (current ? current : true));
      setPendingConnectOpen((current) => (current ? false : current));
    }
  }, [
    accountAddress,
    cancelManualConnect,
    connectModalOpen,
    connectMode,
    disconnectedWithoutAccount,
    hasPendingConnectRequest,
    passiveShellActive,
    pendingConnectOpen,
    resetConnectRequest,
    runtimeStatus?.walletProviderState,
    displayedConnectFailure,
    wallet.status,
    walletConnectedState,
    walletRuntime.loaded,
  ]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  function handleToggleMenu() {
    if (wallet.isConnecting) {
      return;
    }
    setMenuOpen((current) => !current);
  }

  if (wallet.status === "connected") {
    return (
      <div
        ref={shellRef}
        className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""} ${
          isMobileDrawer ? "wallet-connect-shell-drawer" : ""
        }`.trim()}
      >
        <div
          className={`wallet-sync-button ${wallet.status === "connected" ? "is-synced" : ""} ${
            wallet.isConnecting ? "is-syncing" : ""
          }`.trim()}
        >
          <button
            type="button"
            className="wallet-sync-toggle"
            onClick={handleToggleMenu}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <WalletStatus
              status={wallet.status}
              address={wallet.accountAddress}
              walletName={wallet.walletName}
              compact={compact}
              showAddress={false}
              onPressAddress={handleToggleMenu}
            />
          </button>
          {isMobileDrawer ? <span className="mobile-drawer-wallet-identity">{wallet.displayName}</span> : null}
          {accountAddress && !compact ? (
            <Suspense fallback={<WalletAddressFallback address={accountAddress} onPress={handleToggleMenu} />}>
              <LazySuiAddressDisplay
                address={accountAddress}
                className="wallet-sync-address-shell"
                labelClassName="wallet-sync-address"
                showCopyLabel={false}
                showTooltip={!compact}
                copyOnClick={!compact}
                onPress={handleToggleMenu}
              />
            </Suspense>
          ) : null}
        </div>

        {menuOpen ? (
          <Suspense fallback={<ConnectedWalletMenuFallback />}>
            <LazyConnectedWalletMenu
              accountAddress={accountAddress ?? undefined}
              onClose={() => setMenuOpen(false)}
              walletName={wallet.walletName}
            />
          </Suspense>
        ) : null}
      </div>
    );
  }

  if (passiveShellActive) {
    return (
      <div className={shellClassName}>
        <div className="wallet-connect-direct panel">
          <div className="wallet-connect-direct-copy">
            <strong>{isAdminGate ? "Connect Wallet" : "Activate Session"}</strong>
            <span>{isAdminGate ? "Choose the wallet and approved address for this workspace." : "Wallet-optional public mode"}</span>
          </div>
          <div className="wallet-connect-actions">
            <button
              type="button"
              className="wallet-connect-trigger"
              onClick={() => void handleManualConnectRequest()}
              disabled={wallet.isConnecting || connectModalOpen || routeRecoveryActive}
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showInlineSlushRecovery) {
    return (
      <div className={shellClassName}>
        <div className="wallet-connect-direct panel">
          <div className="wallet-connect-direct-copy">
            <strong>Slush connection needs reset</strong>
            <span>
              Slush could not register this dApp connection. Open Slush, remove the old DeepSignal connection, then try again.
            </span>
          </div>
          <div className="wallet-connect-actions">
            <button
              type="button"
              className="wallet-connect-trigger"
              onClick={handleConnectFailureRetry}
              disabled={wallet.isConnecting || routeRecoveryActive || resetPending}
            >
              Retry
            </button>
            <button
              type="button"
              className="wallet-connect-dismiss"
              onClick={() => tryOpenSlushApp()}
              disabled={resetPending}
            >
              Open Slush
            </button>
            <button
              type="button"
              className="wallet-connect-dismiss"
              onClick={() => openSlushConnectionGuide()}
              disabled={resetPending}
            >
              Reset connection guide
            </button>
            <button
              type="button"
              className="wallet-connect-dismiss"
              onClick={() => void handleHardResetWalletSession()}
              disabled={resetPending}
            >
              {resetPending ? "Resetting..." : "Reset wallet session"}
            </button>
            <button
              type="button"
              className="wallet-connect-dismiss"
              onClick={() => void copyRouteLifecycleDiagnosticsToClipboard().catch(() => undefined)}
              disabled={resetPending}
            >
              Copy diagnostics
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!walletRuntime.loaded) {
    return (
      <div className={shellClassName}>
        <div className="wallet-connect-direct panel">
          <div className="wallet-connect-direct-copy">
            <strong>
              {isMobileDrawer
                ? providerLoadFailed
                  ? t("notConnected")
                  : showStandbyState
                  ? t("secureSessionStandby")
                  : t("notConnected")
                : providerLoadFailed
                  ? "Retry Session"
                  : isAdminGate
                  ? "Connect Wallet"
                  : showStandbyState
                  ? "Opening Session..."
                  : "Activate Session"}
            </strong>
            <span>
              {isMobileDrawer
                ? providerLoadFailed
                  ? t("connectWalletToReview")
                  : showStandbyState
                  ? t("secureSessionStandby")
                  : t("connectWalletToReview")
                : providerLoadFailed
                  ? "Wallet runtime did not open. Try again."
                  : isAdminGate
                  ? "Choose the wallet and approved address for this workspace."
                  : showStandbyState
                  ? waitingForProviderOpen || manualConnectPendingUi || wallet.status === "booting" || wallet.status === "provider_pending" || wallet.connectMode === "manual"
                    ? "Preparing secure session"
                    : "Restoring secure session"
                  : "Wallet-optional public mode"}
            </span>
          </div>
          <div className="wallet-connect-actions">
            <button
              type="button"
              className="wallet-connect-trigger"
              onClick={() => void handleManualConnectRequest()}
              disabled={wallet.isConnecting || connectModalOpen || routeRecoveryActive}
            >
                {waitingForProviderOpen || wallet.isConnecting || manualConnectPendingUi
                  ? "Opening..."
                  : routeRecoveryActive
                    ? "Route recovering..."
                : providerLoadFailed
                  ? "Retry"
                : wallet.status === "booting" || wallet.status === "provider_pending"
                  ? "Prepare"
                  : "Connect"}
            </button>
            {showStandbyState || providerLoadFailed ? (
              <button
                type="button"
                className="wallet-connect-dismiss"
                onClick={() => void handleResetWalletSession()}
                disabled={resetPending}
              >
                {resetPending ? "Resetting..." : "Reset wallet connection"}
              </button>
            ) : null}
            {waitingForProviderOpen || providerLoadFailed ? (
              <button
                type="button"
                className="wallet-connect-dismiss"
                onClick={() => {
                  resetConnectRequest();
                  cancelManualConnect();
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
          {displayedConnectFailure?.userMessage ? (
            <p className="wallet-connect-error-copy" role="alert">
              {displayedConnectFailure.userMessage}
            </p>
          ) : null}
          {routeRecovery.phase === "css_failed" ? (
            <button
              type="button"
              className="wallet-connect-dismiss"
              onClick={() => window.location.reload()}
            >
              Reload route assets
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (walletConnectImportFailed) {
    return (
      <div className={shellClassName}>
        <div className="wallet-connect-direct panel">
          <div className="wallet-connect-direct-copy">
            <strong>Retry Session</strong>
            <span>Wallet connect UI did not open. Retry only when you choose to continue.</span>
          </div>
          <div className="wallet-connect-actions">
            <button
              type="button"
              className="wallet-connect-trigger"
              onClick={() => void handleManualConnectRequest()}
              disabled={wallet.isConnecting || connectModalOpen || routeRecoveryActive}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const suspenseFallback = fallback ?? <WalletConnectFallback compact={compact} />;

  return (
    <WalletConnectImportBoundary
      fallback={suspenseFallback}
      onError={(error, errorInfo) => {
        setWalletConnectImportFailed(true);
        logRouteLifecycle("wallet-connect-lazy-import-failed", {
          accountAddress: accountAddress ? "present" : "absent",
          componentStack: errorInfo.componentStack,
          connectMode,
          walletConnectedState,
          error,
        });
      }}
      resetKey={`${walletConnectImportResetNonce}:${passiveUntilRequested ? "passive" : "interactive"}`}
    >
      <Suspense fallback={suspenseFallback}>
        {walletConnectImportFailed ? (
          suspenseFallback
        ) : (
          <WalletConnect
            compact={compact}
            surface={surface}
            connectModalOpen={connectModalOpen}
            onConnectModalOpenChange={handleConnectModalOpenChange}
            onConnectModalCancel={() => {
              resetConnectRequest();
              cancelManualConnect();
            }}
            onConnectAttemptFailure={(failure) => {
              setConnectFailureOverride(failure);
            }}
            onConnectAttemptSuccess={() => {
              setConnectFailureOverride(null);
            }}
            onManualConnectRequest={handleManualConnectRequest}
            connectFailure={displayedConnectFailure}
          />
        )}
      </Suspense>
    </WalletConnectImportBoundary>
  );
}
