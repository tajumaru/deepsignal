import { ConnectModal } from "@mysten/dapp-kit";
import { WalletStatus } from "./WalletStatus";
import type { SuiWalletState } from "../../hooks/useSuiWallet";

interface ConnectWalletButtonProps {
  wallet: SuiWalletState;
  compact?: boolean;
  onConnectedPress?: () => void;
  connectedMenuOpen?: boolean;
  connectModalOpen?: boolean;
  onConnectModalOpenChange?: (open: boolean) => void;
}

export function ConnectWalletButton({
  wallet,
  compact = false,
  onConnectedPress,
  connectedMenuOpen = false,
  connectModalOpen,
  onConnectModalOpenChange,
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
    <ConnectModal
      open={connectModalOpen ?? false}
      onOpenChange={(open) => onConnectModalOpenChange?.(open)}
      trigger={
        <button type="button" className="wallet-connect-trigger">
          Connect Wallet
        </button>
      }
    />
  );
}
