import {
  ConnectButton,
  useAutoConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
} from "@mysten/dapp-kit";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { SuiAddressDisplay } from "./SuiAddressDisplay";

interface WalletConnectProps {
  compact?: boolean;
}

export function WalletConnect({ compact = false }: WalletConnectProps) {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const {
    currentWallet,
    isConnected,
    isConnecting,
  } = useCurrentWallet();
  const autoConnectStatus = useAutoConnectWallet();
  const disconnectWallet = useDisconnectWallet();
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
      await disconnectWallet.mutateAsync();
      setMenuOpen(false);
    } catch (error) {
      console.error(error);
    }
  }

  function handleToggleMenu() {
    if (isConnecting) {
      return;
    }
    setMenuOpen((current) => !current);
  }

  const isRestoringConnection = !isConnected && (isConnecting || autoConnectStatus === "idle");

  const buttonLabel = isRestoringConnection
    ? "Syncing Signal..."
    : isConnected
      ? "Synced"
      : "Sync Wallet";

  const statusCopy = isConnected
    ? "SIGNAL LINK ESTABLISHED"
    : isRestoringConnection
      ? "Restoring wallet uplink"
      : "Wallet-optional public mode";

  if (!isConnected) {
    return (
      <div className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""}`.trim()}>
        <div className="wallet-connect-direct panel">
          <div className="wallet-connect-direct-copy">
            <strong>{buttonLabel}</strong>
            <span>{statusCopy}</span>
          </div>
          {isRestoringConnection ? (
            <button type="button" className="wallet-sync-button is-syncing" disabled>
              <span className="wallet-sync-indicator is-pending" />
              <span>Restoring...</span>
            </button>
          ) : (
            <ConnectButton />
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={shellRef} className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""}`.trim()}>
      <div
        className={`wallet-sync-button ${isConnected ? "is-synced" : ""} ${isConnecting ? "is-syncing" : ""}`}
      >
        <button
          type="button"
          className="wallet-sync-toggle"
          onClick={handleToggleMenu}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className={`wallet-sync-indicator ${isConnected ? "is-live" : isConnecting ? "is-pending" : "is-idle"}`} />
          <span className="wallet-sync-copy">
            <strong>{buttonLabel}</strong>
            <span>{statusCopy}</span>
          </span>
        </button>
        {isConnected && account?.address ? (
          <SuiAddressDisplay
            address={account.address}
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
            <strong>{currentWallet?.name ?? "Wallet"}</strong>
            {account?.address ? (
              <SuiAddressDisplay
                address={account.address}
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
            disabled={disconnectWallet.isPending}
            role="menuitem"
            title="Disconnect"
          >
            <span className="wallet-sync-disconnect-icon" aria-hidden="true" />
            <span>{disconnectWallet.isPending ? "Disconnecting..." : "Disconnect"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
