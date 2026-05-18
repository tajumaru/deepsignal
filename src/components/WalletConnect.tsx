import { useEffect, useRef, useState } from "react";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { ConnectWalletButton } from "./wallet";
import { SuiAddressDisplay } from "./SuiAddressDisplay";

interface WalletConnectProps {
  compact?: boolean;
}

export function WalletConnect({ compact = false }: WalletConnectProps) {
  const { t } = useI18n();
  const wallet = useSuiWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  async function handleDisconnect() {
    try {
      await wallet.disconnect();
      setMenuOpen(false);
    } catch (error) {
      console.error(error);
    }
  }

  function handleToggleMenu() {
    if (wallet.isConnecting) {
      return;
    }
    setMenuOpen((current) => !current);
  }

  if (!wallet.isConnected) {
    return (
      <div className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""}`.trim()}>
        <div className="wallet-connect-direct panel">
          <div className="wallet-connect-direct-copy">
            <strong>{wallet.isRestoringConnection ? "Syncing Signal..." : "Sync Wallet"}</strong>
            <span>{wallet.isRestoringConnection ? "Restoring wallet uplink" : "Wallet-optional public mode"}</span>
          </div>
          <ConnectWalletButton wallet={wallet} compact={compact} />
        </div>
      </div>
    );
  }

  return (
    <div ref={shellRef} className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""}`.trim()}>
      <div
        className={`wallet-sync-button ${wallet.isConnected ? "is-synced" : ""} ${wallet.isConnecting ? "is-syncing" : ""}`}
      >
        <ConnectWalletButton wallet={wallet} compact={compact} onConnectedPress={handleToggleMenu} />
        {wallet.accountAddress ? (
          <SuiAddressDisplay
            address={wallet.accountAddress}
            className="wallet-sync-address-shell"
            labelClassName="wallet-sync-address"
            showCopyLabel={false}
            showTooltip={!compact}
            copyOnClick={!compact}
            onPress={handleToggleMenu}
          />
        ) : null}
      </div>

      {menuOpen ? (
        <div className="wallet-sync-menu panel" role="menu">
          <div className="wallet-sync-menu-header">
            <span className="wallet-sync-menu-eyebrow">{t("connectedLabel")}</span>
            <strong>{wallet.walletName ?? "Wallet"}</strong>
            {wallet.accountAddress ? (
              <SuiAddressDisplay
                address={wallet.accountAddress}
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
            disabled={wallet.isDisconnecting}
            role="menuitem"
            title="Disconnect"
          >
            <span className="wallet-sync-disconnect-icon" aria-hidden="true" />
            <span>{wallet.isDisconnecting ? "Disconnecting..." : "Disconnect"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
