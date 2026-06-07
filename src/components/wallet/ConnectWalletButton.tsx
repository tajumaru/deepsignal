import { ConnectModal } from "@mysten/dapp-kit";
import type { SuiWalletState } from "../../hooks/useSuiWallet";
import { WalletStatus } from "./WalletStatus";

interface ConnectWalletButtonProps {
  wallet: SuiWalletState;
  compact?: boolean;
  onConnectedPress?: () => void;
  connectedMenuOpen?: boolean;
  connectModalOpen?: boolean;
  onConnectModalOpenChange?: (open: boolean) => void;
  onManualConnectRequest?: () => Promise<void> | void;
}

export function ConnectWalletButton({
  wallet,
  compact = false,
  onConnectedPress,
  connectedMenuOpen = false,
  connectModalOpen,
  onConnectModalOpenChange,
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
        <ConnectModal
          open
          onOpenChange={(open) => onConnectModalOpenChange?.(open)}
          trigger={<span aria-hidden="true" style={{ display: "none" }} />}
        />
      ) : null}
    </>
  );
}
