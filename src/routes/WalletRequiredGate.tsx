import type { ReactNode } from "react";
import { WalletConnectSurface } from "../components/WalletConnectSurface";
import type { WalletSessionState } from "../walletSessionState";
import { getWalletRouteGateStatus } from "./walletRouteGateStatus";

function WalletRouteLoadingShell() {
  return (
    <section className="stack">
      <div className="panel glow-panel route-status-panel route-status-panel-compact" role="status" aria-live="polite">
        <p className="eyebrow">Secure session</p>
        <h1>Loading wallet provider...</h1>
        <p className="muted">DeepSignal is preparing the secure workspace before route content can render.</p>
      </div>
    </section>
  );
}

function ConnectWalletRequired() {
  return (
    <section className="stack">
      <div className="panel glow-panel route-status-panel route-status-panel-compact">
        <p className="eyebrow">Wallet required</p>
        <h1>Connect Wallet Required</h1>
        <p className="muted">Connect a wallet to open this secure signal workspace route.</p>
        <WalletConnectSurface compact context="adminGate" />
      </div>
    </section>
  );
}

export function WalletRequiredGate({
  children,
  walletRequired,
  walletSession,
}: {
  children: ReactNode;
  walletRequired: boolean;
  walletSession: WalletSessionState;
}) {
  const status = getWalletRouteGateStatus(walletRequired, walletSession);

  if (status === "provider_pending") {
    return <WalletRouteLoadingShell />;
  }

  if (status === "disconnected") {
    return <ConnectWalletRequired />;
  }

  return <>{children}</>;
}
