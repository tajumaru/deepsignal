import { useDisconnectWallet, useAccounts, useSwitchAccount } from "../../lib/mystenDappKitCompat";
import { SuiAddressDisplay } from "../SuiAddressDisplay";

interface ConnectedWalletMenuProps {
  accountAddress?: string;
  onClose?: () => void;
  walletName?: string;
}

export function ConnectedWalletMenu({ accountAddress, onClose, walletName }: ConnectedWalletMenuProps) {
  const accounts = useAccounts();
  const { mutateAsync: disconnectWallet, isPending: disconnectPending } = useDisconnectWallet();
  const { mutateAsync: switchAccount, isPending: switchPending } = useSwitchAccount();

  async function handleDisconnect() {
    await disconnectWallet();
    onClose?.();
  }

  async function handleSwitchAccount(account: (typeof accounts)[number]) {
    await switchAccount({ account });
    onClose?.();
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

      {accounts.length > 1
        ? accounts.map((account) => {
            const active = account.address === accountAddress;
            return (
              <button
                key={account.address}
                type="button"
                className={`wallet-sync-menu-item ${active ? "is-active" : ""}`.trim()}
                onClick={() => void handleSwitchAccount(account)}
                disabled={switchPending || active}
                role="menuitem"
                title={active ? "Current address" : "Switch address"}
              >
                <span className="wallet-sync-copy">
                  <strong>{account.label || (active ? "Current address" : "Switch address")}</strong>
                  <span>{account.address}</span>
                </span>
              </button>
            );
          })
        : null}

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
