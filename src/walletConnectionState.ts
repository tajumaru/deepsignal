import type { WalletConnectionState } from "./walletStatus";

export function deriveWalletConnectionState(input: {
  accountAddress: string | null | undefined;
  connectionStatus: "connecting" | "disconnected" | "connected";
  currentWalletName: string | null | undefined;
  fallbackAccounts?: readonly { address: string }[] | null;
  isConnected: boolean;
  manualConnectActive?: boolean;
  suppressRestoringConnection?: boolean;
}): WalletConnectionState {
  const accountAddress = input.accountAddress ?? input.fallbackAccounts?.[0]?.address ?? null;
  const hasConnectedAccount = Boolean(input.isConnected && accountAddress);
  const hasPendingConnection = input.connectionStatus === "connecting" && !hasConnectedAccount;
  const isManualConnection = hasPendingConnection && input.manualConnectActive === true;
  const isRestoringConnection = hasPendingConnection && !isManualConnection && input.suppressRestoringConnection !== true;

  return {
    status: hasConnectedAccount ? "connected" : isManualConnection || isRestoringConnection ? "connecting" : "disconnected",
    accountAddress,
    walletName: input.currentWalletName ?? null,
    isRestoringConnection,
    connectMode: isManualConnection ? "manual" : isRestoringConnection ? "autoRestore" : null,
    connectLockState: isManualConnection ? "manual_connecting" : isRestoringConnection ? "auto_restoring" : "idle",
    lastConnectFailure: null,
  };
}
