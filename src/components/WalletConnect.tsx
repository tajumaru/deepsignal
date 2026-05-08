import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

function formatWalletAddress(address?: string | null) {
  if (!address) {
    return "No address";
  }
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnect() {
  const { t } = useI18n();
  const wallets = useWallets();
  const account = useCurrentAccount();
  const {
    currentWallet,
    isConnected,
    isConnecting,
  } = useCurrentWallet();
  const connectWallet = useConnectWallet();
  const disconnectWallet = useDisconnectWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  async function handleConnect(walletName: string) {
    const wallet = wallets.find((entry) => entry.name === walletName);
    if (!wallet) {
      return;
    }
    try {
      await connectWallet.mutateAsync({ wallet });
      setMenuOpen(false);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectWallet.mutateAsync();
      setMenuOpen(false);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleCopyAddress() {
    if (!account?.address) {
      return;
    }
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
    } catch (error) {
      console.error(error);
    }
  }

  const buttonLabel = isConnecting
    ? "Syncing Signal..."
    : isConnected
      ? "Synced"
      : "Sync Wallet";

  const statusCopy = isConnected
    ? "SIGNAL LINK ESTABLISHED"
    : isConnecting
      ? "Establishing wallet uplink"
      : "Wallet-optional public mode";

  return (
    <div ref={shellRef} className="wallet-connect-shell">
      <button
        type="button"
        className={`wallet-sync-button ${isConnected ? "is-synced" : ""} ${isConnecting ? "is-syncing" : ""}`}
        onClick={() => {
          if (isConnecting) {
            return;
          }
          setMenuOpen((current) => !current);
        }}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span className={`wallet-sync-indicator ${isConnected ? "is-live" : isConnecting ? "is-pending" : "is-idle"}`} />
        <span className="wallet-sync-copy">
          <strong>{buttonLabel}</strong>
          <span>{statusCopy}</span>
        </span>
        {isConnected ? (
          <span className="wallet-sync-address">{formatWalletAddress(account?.address)}</span>
        ) : null}
      </button>

      {menuOpen ? (
        <div className="wallet-sync-menu panel" role="menu">
          {isConnected ? (
            <>
              <div className="wallet-sync-menu-header">
                <span className="wallet-sync-menu-eyebrow">{t("connectedLabel")}</span>
                <strong>{currentWallet?.name ?? "Wallet"}</strong>
                <code>{account?.address ?? "No address available"}</code>
              </div>
              <button
                type="button"
                className="wallet-sync-menu-item"
                onClick={() => void handleCopyAddress()}
                role="menuitem"
              >
                <span>{copied ? "Address Copied" : "Copy Address"}</span>
                <small>{formatWalletAddress(account?.address)}</small>
              </button>
              <button
                type="button"
                className="wallet-sync-menu-item wallet-sync-menu-item-danger"
                onClick={() => void handleDisconnect()}
                disabled={disconnectWallet.isPending}
                role="menuitem"
              >
                <span>{disconnectWallet.isPending ? "Disconnecting..." : "Disconnect"}</span>
                <small>Return to wallet-optional mode</small>
              </button>
            </>
          ) : (
            <>
              <div className="wallet-sync-menu-header">
                <span className="wallet-sync-menu-eyebrow">Wallet Uplink</span>
                <strong>Select a signal-compatible wallet</strong>
                <p className="wallet-sync-menu-note">
                  {wallets.length > 0
                    ? "Choose a wallet to sync DeepSignal author and review flows."
                    : "No compatible wallet detected in this browser."}
                </p>
              </div>
              <div className="wallet-sync-wallets">
                {wallets.length > 0 ? (
                  wallets.map((wallet) => (
                    <button
                      key={wallet.name}
                      type="button"
                      className="wallet-sync-menu-item"
                      onClick={() => void handleConnect(wallet.name)}
                      disabled={connectWallet.isPending}
                      role="menuitem"
                    >
                      <span>{wallet.name}</span>
                      <small>{connectWallet.isPending ? "Syncing Signal..." : "Connect"}</small>
                    </button>
                  ))
                ) : (
                  <div className="wallet-sync-empty">
                    <strong>Wallet unavailable</strong>
                    <p>Install a Sui wallet extension to enable creator and reviewer sync.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
