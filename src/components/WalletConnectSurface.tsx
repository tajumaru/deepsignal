import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import "../styles/components/wallet-network.css";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { retryLazyImport } from "../lib/lazyRetry";
import { SuiAddressDisplay } from "./SuiAddressDisplay";
import { WalletStatus } from "./wallet/WalletStatus";

const WalletConnect = lazy(() =>
  retryLazyImport(() => import("./WalletConnect"), "wallet-connect").then((module) => ({ default: module.WalletConnect })),
);

interface WalletConnectSurfaceProps {
  compact?: boolean;
  fallback?: ReactNode;
  surface?: "default" | "mobileDrawer";
}

function WalletConnectFallback({ compact = false }: { compact?: boolean }) {
  return <div className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""}`.trim()} />;
}

export function WalletConnectSurface({ compact = false, fallback, surface = "default" }: WalletConnectSurfaceProps) {
  const { t } = useI18n();
  const wallet = useSuiWallet();
  const [connectRequested, setConnectRequested] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const isMobileDrawer = surface === "mobileDrawer";

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
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

  if (wallet.status === "connected") {
    return (
      <div
        ref={shellRef}
        className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""} ${
          isMobileDrawer ? "wallet-connect-shell-drawer" : ""
        }`.trim()}
      >
        <div
          className={`wallet-sync-button ${wallet.isConnected ? "is-synced" : ""} ${
            wallet.isConnecting ? "is-syncing" : ""
          }`.trim()}
        >
          <button
            type="button"
            className="wallet-sync-toggle"
            onClick={handleToggleMenu}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <WalletStatus
              status={wallet.status}
              address={wallet.accountAddress}
              walletName={wallet.walletName}
              compact={compact}
              showAddress={false}
              onPressAddress={handleToggleMenu}
            />
          </button>
          {isMobileDrawer ? <span className="mobile-drawer-wallet-identity">{wallet.displayName}</span> : null}
          {wallet.accountAddress && !compact ? (
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
              <span className="wallet-sync-menu-eyebrow">{t("secureSessionActive")}</span>
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

  if (!connectRequested) {
    return (
      <div
        className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""} ${
          isMobileDrawer ? "wallet-connect-shell-drawer" : ""
        }`.trim()}
      >
        <div className="wallet-connect-direct panel">
          <div className="wallet-connect-direct-copy">
            <strong>
              {isMobileDrawer
                ? wallet.isRestoringConnection
                  ? t("secureSessionStandby")
                  : t("notConnected")
                : wallet.isRestoringConnection
                  ? "Opening Session..."
                  : "Activate Session"}
            </strong>
            <span>
              {isMobileDrawer
                ? wallet.isRestoringConnection
                  ? t("secureSessionStandby")
                  : t("connectWalletToReview")
                : wallet.isRestoringConnection
                  ? "Restoring secure session"
                  : "Wallet-optional public mode"}
            </span>
          </div>
          <button
            type="button"
            className="wallet-connect-trigger"
            onClick={() => setConnectRequested(true)}
            disabled={wallet.isConnecting}
          >
            {wallet.isConnecting ? "Opening..." : "Connect"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={fallback ?? <WalletConnectFallback compact={compact} />}>
      <WalletConnect compact={compact} surface={surface} />
    </Suspense>
  );
}
