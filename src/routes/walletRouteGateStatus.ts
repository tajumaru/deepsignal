import type { WalletSessionState } from "../walletSessionState";

export type WalletRouteGateStatus = "allowed" | "disconnected" | "provider_pending";

export function getWalletRouteGateStatus(
  walletRequired: boolean,
  walletSession: WalletSessionState,
): WalletRouteGateStatus {
  if (!walletRequired) {
    return "allowed";
  }
  if (!walletSession.providerMounted || walletSession.providerLoading || walletSession.phase === "provider_deferred") {
    return "provider_pending";
  }
  if (!walletSession.accountAddress || walletSession.phase !== "connected") {
    return "disconnected";
  }
  return "allowed";
}
