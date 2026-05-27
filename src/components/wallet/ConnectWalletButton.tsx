import { ConnectButton } from "@mysten/dapp-kit";
import { WalletStatus } from "./WalletStatus";
import type { SuiWalletState } from "../../hooks/useSuiWallet";

interface ConnectWalletButtonProps {
  wallet: SuiWalletState;
  compact?: boolean;
  onConnectedPress?: () => void;
  connectedMenuOpen?: boolean;
}

export function ConnectWalletButton({
  wallet,
  compact = false,
  onConnectedPress,
  connectedMenuOpen = false,
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

  return <ConnectButton />;
}
