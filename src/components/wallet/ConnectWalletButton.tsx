import { useConnectWallet, useWallets } from "@mysten/dapp-kit";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import { useRef } from "react";
import type { SuiWalletState } from "../../hooks/useSuiWallet";
import { logRouteLifecycle } from "../../lib/routeDiagnostics";
import type { WalletConnectFailureClassification, WalletConnectFailureState } from "../../walletStatus";
import { WalletStatus } from "./WalletStatus";

interface ConnectWalletButtonProps {
  wallet: SuiWalletState;
  compact?: boolean;
  onConnectedPress?: () => void;
  connectedMenuOpen?: boolean;
  connectModalOpen?: boolean;
  onConnectModalOpenChange?: (open: boolean) => void;
  onConnectModalCancel?: () => void;
  onConnectAttemptFailure?: (failure: WalletConnectFailureState) => void;
  onConnectAttemptSuccess?: () => void;
  onManualConnectRequest?: () => Promise<void> | void;
  connectFailure?: WalletConnectFailureState | null;
}

function isSlushWallet(wallet: WalletWithRequiredFeatures) {
  return /slush/i.test(wallet.name);
}

function createConnectFailure(
  classification: WalletConnectFailureClassification,
  message: string,
  walletId?: string | null,
  walletName?: string | null,
): WalletConnectFailureState {
  const slushRecovery = classification === "slush_dapp_registration_failed" || classification === "slush_connect_no_result";
  return {
    classification,
    message,
    source: "slush_injected_provider",
    requiresSlushRecovery: slushRecovery,
    userMessage: slushRecovery
      ? "Slush could not register this dApp connection. Open Slush, remove the old DeepSignal connection, then try again."
      : null,
    selectedWalletId: walletId,
    selectedWalletName: walletName,
  };
}

export function ConnectWalletButton({
  wallet,
  compact = false,
  onConnectedPress,
  connectedMenuOpen = false,
  connectModalOpen,
  onConnectModalOpenChange,
  onConnectModalCancel,
  onConnectAttemptFailure,
  onConnectAttemptSuccess,
  onManualConnectRequest,
  connectFailure = null,
}: ConnectWalletButtonProps) {
  const wallets = useWallets();
  const connectWallet = useConnectWallet();
  const connectAttemptIdRef = useRef(0);

  async function handleWalletSelect(walletToConnect: WalletWithRequiredFeatures) {
    if (connectWallet.isPending) {
      return;
    }

    const attemptId = connectAttemptIdRef.current + 1;
    connectAttemptIdRef.current = attemptId;
    const routePath = typeof window === "undefined" ? "" : window.location.hash?.replace(/^#/, "") || window.location.pathname;
    const slushWallet = isSlushWallet(walletToConnect);

    logRouteLifecycle("wallet-connect-adapter-call", {
      attemptId,
      routePath,
      selectedWalletName: walletToConnect.name,
      walletId: walletToConnect.name,
    });

    if (slushWallet) {
      logRouteLifecycle("wallet-connect-slush-modal-open", {
        attemptId,
        routePath,
        selectedWalletName: walletToConnect.name,
      });
    }

    const timeoutMs = 15_000;
    let timedOut = false;
    let timeoutId = 0;

    try {
      const connectPromise = connectWallet.mutateAsync({
        wallet: walletToConnect,
      });
      const result = await Promise.race([
        connectPromise,
        new Promise<never>((_resolve, reject) => {
          timeoutId = window.setTimeout(() => {
            timedOut = true;
            reject(new Error("__DEEPSIGNAL_WALLET_CONNECT_TIMEOUT__"));
          }, timeoutMs);
        }),
      ]);
      window.clearTimeout(timeoutId);

      const accounts = Array.isArray(result.accounts) ? result.accounts : [];
      const accountAddresses = accounts.map((account) => account.address);
      const selectedAddress = accountAddresses[0] ?? null;

      logRouteLifecycle("wallet-connect-adapter-resolved", {
        attemptId,
        accountAddresses,
        routePath,
        returnedAccountAddress: selectedAddress,
        returnedAccountCount: accounts.length,
        selectedWalletName: walletToConnect.name,
      });

      if (!selectedAddress) {
        const failure = createConnectFailure(
          slushWallet ? "slush_connect_no_result" : "generic",
          "Wallet connect resolved without an account address.",
          walletToConnect.name,
          walletToConnect.name,
        );
        onConnectAttemptFailure?.(failure);
        return;
      }

      onConnectAttemptSuccess?.();
    } catch (error) {
      window.clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : String(error ?? "Unknown wallet connect error");

      if (timedOut || message === "__DEEPSIGNAL_WALLET_CONNECT_TIMEOUT__") {
        logRouteLifecycle("wallet-connect-timeout", {
          attemptId,
          routePath,
          selectedWalletName: walletToConnect.name,
          timeoutMs,
        });
        onConnectAttemptFailure?.(
          createConnectFailure(
            slushWallet ? "slush_connect_no_result" : "generic",
            "Wallet connect timed out without a selected account.",
            walletToConnect.name,
            walletToConnect.name,
          ),
        );
      } else {
        const classification =
          slushWallet && /Failed to add dApp connection/i.test(message) ? "slush_dapp_registration_failed" : "generic";
        logRouteLifecycle("wallet-connect-adapter-rejected", {
          attemptId,
          classification,
          errorMessage: message,
          errorSource: "slush_injected_provider",
          requiresSlushRecovery: classification === "slush_dapp_registration_failed",
          routePath,
          selectedWalletId: walletToConnect.name,
          selectedWalletName: walletToConnect.name,
        });
        onConnectAttemptFailure?.(
          createConnectFailure(
            classification,
            message,
            walletToConnect.name,
            walletToConnect.name,
          ),
        );
      }
    } finally {
      logRouteLifecycle("wallet-connect-final-state", {
        attemptId,
        connectModalOpen,
        routePath,
        selectedWalletName: walletToConnect.name,
        walletAccountAddress: wallet.accountAddress ?? null,
        walletStatus: wallet.status,
      });
    }
  }

  if (wallet.status === "connected") {
    return (
      <button
        type="button"
        className="wallet-sync-toggle"
        onClick={onConnectedPress}
        aria-expanded={connectedMenuOpen}
        aria-haspopup="menu"
      >
        <WalletStatus
          status={wallet.status}
          address={wallet.accountAddress}
          walletName={wallet.walletName}
          compact={compact}
          showAddress={false}
          onPressAddress={onConnectedPress}
        />
      </button>
    );
  }

  if (wallet.status === "connecting" || wallet.status === "provider_pending" || wallet.status === "booting") {
    return (
      <button type="button" className="wallet-sync-button is-syncing" disabled>
        <WalletStatus status={wallet.status} compact={compact} />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="wallet-connect-trigger"
        onClick={() => void onManualConnectRequest?.()}
        disabled={wallet.isConnecting || connectModalOpen}
      >
        Connect Wallet
      </button>
      {connectModalOpen ? (
        <div className="wallet-connect-direct panel" role="dialog" aria-modal="true" aria-label="Choose wallet">
          <div className="wallet-connect-direct-copy">
            <strong>Choose Wallet</strong>
            <span>Select a wallet, then finish account approval in the wallet app.</span>
          </div>
          {connectFailure?.requiresSlushRecovery ? (
            <p className="wallet-connect-error-copy" role="alert">
              {connectFailure.userMessage ??
                "Slush could not register this dApp connection. Open Slush, remove the old DeepSignal connection, then try again."}
            </p>
          ) : null}
          <div className="wallet-connect-actions">
            {wallets.map((walletOption) => (
              <button
                key={walletOption.name}
                type="button"
                className="wallet-connect-trigger"
                onClick={() => void handleWalletSelect(walletOption)}
                disabled={connectWallet.isPending}
              >
                {connectWallet.isPending ? `Waiting for ${walletOption.name}...` : walletOption.name}
              </button>
            ))}
            <button
              type="button"
              className="wallet-connect-dismiss"
              onClick={() => {
                onConnectModalCancel?.();
                onConnectModalOpenChange?.(false);
              }}
              disabled={connectWallet.isPending}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
