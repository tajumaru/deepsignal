import { useState } from "react";
import { useOptionalWalletActions } from "../../walletStatus";
import { SuiAddressDisplay } from "../SuiAddressDisplay";

interface ConnectedWalletMenuProps {
  accountAddress?: string;
  onClose?: () => void;
  walletName?: string;
}

export function ConnectedWalletMenu({ accountAddress, onClose, walletName }: ConnectedWalletMenuProps) {
  const walletActions = useOptionalWalletActions();
  const [disconnectPending, setDisconnectPending] = useState(false);

  async function handleDisconnect() {
    setDisconnectPending(true);
    try {
      await walletActions.disconnect();
      onClose?.();
    } finally {
      setDisconnectPending(false);
    }
  }

  return (
    <div className="wallet-sync-menu panel" role="menu">
      <div className="wallet-sync-menu-header">
        <span className="wallet-sync-menu-eyebrow">Secure session active</span>
        <strong>{walletName ?? "Wallet"}</strong>
        {accountAddress ? (
          <SuiAddressDisplay
            address={accountAddress}
            className="wallet-sync-copy-chip-shell"
            labelClassName="wallet-sync-copy-chip-address"
            copyClassName="wallet-sync-copy-chip-copy"
            showTooltip
          />
        ) : null}
      </div>
      <button
        type="button"
        className="wallet-sync-disconnect-button"
        onClick={() => void handleDisconnect()}
        disabled={disconnectPending}
        role="menuitem"
        title="Disconnect"
      >
        <span className="wallet-sync-disconnect-icon" aria-hidden="true" />
        <span>{disconnectPending ? "Disconnecting..." : "Disconnect"}</span>
      </button>
    </div>
  );
}
