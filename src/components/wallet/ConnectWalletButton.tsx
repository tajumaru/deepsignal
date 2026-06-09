import { MystenConnectModal } from "./MystenConnectModal";
import type { SuiWalletState } from "../../hooks/useSuiWallet";
import type { WalletConnectFailureState } from "../../walletStatus";
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

export function ConnectWalletButton({
  wallet,
  compact = false,
  onConnectedPress,
  connectedMenuOpen = false,
  connectModalOpen = false,
  onConnectModalOpenChange,
  onConnectModalCancel,
  onManualConnectRequest,
}: ConnectWalletButtonProps) {
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

  if (wallet.status === "connecting") {
    return (
      <button type="button" className="wallet-sync-button is-syncing" disabled>
        <WalletStatus status={wallet.status} compact={compact} />
      </button>
    );
  }

  return (
    <MystenConnectModal
      open={connectModalOpen}
      onOpenChange={(open) => {
        onConnectModalOpenChange?.(open);
        if (!open) {
          onConnectModalCancel?.();
        }
      }}
      trigger={
        <button
          type="button"
          className="wallet-connect-trigger"
          onClick={() => {
            void onManualConnectRequest?.();
            onConnectModalOpenChange?.(true);
          }}
        >
          Connect Wallet
        </button>
      }
    />
  );
}
