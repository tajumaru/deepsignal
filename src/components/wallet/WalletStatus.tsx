import { SuiAddressDisplay } from "../SuiAddressDisplay";
import type { SuiWalletConnectionStatus } from "../../hooks/useSuiWallet";

interface WalletStatusProps {
  status: SuiWalletConnectionStatus;
  address?: string;
  walletName?: string;
  connectedLabel?: string;
  connectingLabel?: string;
  disconnectedLabel?: string;
  errorLabel?: string;
  className?: string;
  compact?: boolean;
  showAddress?: boolean;
  onPressAddress?: () => void;
}

export function WalletStatus({
  status,
  address,
  walletName,
  connectedLabel = "Secure Session Active",
  connectingLabel = "Restoring secure session",
  disconnectedLabel = "Wallet-optional public mode",
  errorLabel = "Wallet connection needs attention",
  className = "",
  compact = false,
  showAddress = true,
  onPressAddress,
}: WalletStatusProps) {
  const statusCopy =
    status === "connected"
      ? connectedLabel
      : status === "connecting"
        ? connectingLabel
        : status === "error"
          ? errorLabel
          : disconnectedLabel;

  return (
    <span className={`wallet-status ${className}`.trim()}>
      <span
        className={`wallet-sync-indicator ${
          status === "connected" ? "is-live" : status === "connecting" ? "is-pending" : "is-idle"
        }`}
      />
      <span className="wallet-sync-copy">
        <strong>
          {status === "connected"
            ? "Secure Session"
            : status === "connecting"
              ? "Opening Session..."
              : "Activate Session"}
        </strong>
        <span>{walletName && status === "connected" ? `${statusCopy} · ${walletName}` : statusCopy}</span>
      </span>
      {showAddress && status === "connected" && address ? (
        <SuiAddressDisplay
          address={address}
          className="wallet-sync-address-shell"
          labelClassName="wallet-sync-address"
          showCopyLabel={false}
          showTooltip={!compact}
          copyOnClick={!compact}
          onPress={onPressAddress}
        />
      ) : null}
    </span>
  );
}
