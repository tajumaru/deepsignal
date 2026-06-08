import { useEffect, useRef, useState } from "react";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import type { WalletConnectFailureState } from "../walletStatus";
import { ConnectedWalletMenu, ConnectWalletButton } from "./wallet";
import { SuiAddressDisplay } from "./SuiAddressDisplay";

interface WalletConnectProps {
  compact?: boolean;
  surface?: "default" | "mobileDrawer";
  connectModalOpen?: boolean;
  onConnectModalOpenChange?: (open: boolean) => void;
  onConnectModalCancel?: () => void;
  onConnectAttemptFailure?: (failure: WalletConnectFailureState) => void;
  onConnectAttemptSuccess?: () => void;
  onManualConnectRequest?: () => Promise<void> | void;
  connectFailure?: WalletConnectFailureState | null;
}

export function WalletConnect({
  compact = false,
  surface = "default",
  connectModalOpen = false,
  onConnectModalOpenChange,
  onConnectModalCancel,
  onManualConnectRequest,
}: WalletConnectProps) {
  const { t } = useI18n();
  const wallet = useSuiWallet();
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

  function handleToggleMenu() {
    if (wallet.isConnecting) {
      return;
    }
    setMenuOpen((current) => !current);
  }

  if (wallet.status !== "connected") {
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
                ? wallet.isConnecting
                  ? t("secureSessionStandby")
                  : t("notConnected")
                : wallet.isConnecting
                  ? "Opening Session..."
                  : "Activate Session"}
            </strong>
            <span>
              {isMobileDrawer
                ? wallet.isConnecting
                  ? t("secureSessionStandby")
                  : t("connectWalletToReview")
                : wallet.isConnecting
                  ? "Restoring secure session"
                  : "Wallet-optional public mode"}
            </span>
          </div>
          <ConnectWalletButton
            wallet={wallet}
            compact={compact}
            connectModalOpen={connectModalOpen}
            onConnectModalOpenChange={onConnectModalOpenChange}
            onConnectModalCancel={onConnectModalCancel}
            onManualConnectRequest={onManualConnectRequest}
          />
        </div>
      </div>
    );
  }

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
        <ConnectWalletButton
          wallet={wallet}
          compact={compact}
          onConnectedPress={handleToggleMenu}
          connectedMenuOpen={menuOpen}
        />
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
        <ConnectedWalletMenu
          accountAddress={wallet.accountAddress}
          onClose={() => setMenuOpen(false)}
          walletName={wallet.walletName}
        />
      ) : null}
    </div>
  );
}
