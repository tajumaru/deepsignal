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
  const manualConnectLocked = input.manualConnectActive === true && !hasConnectedAccount;
  const hasWalletSelection = Boolean(
    (input.currentWalletName && input.currentWalletName.trim()) ||
      (input.fallbackAccounts?.length ?? 0) > 0,
  );
  const adapterConnecting =
    input.connectionStatus === "connecting" &&
    !hasConnectedAccount &&
    hasWalletSelection;
  const hasPendingConnection = (manualConnectLocked || adapterConnecting) && !hasConnectedAccount;
  const isManualConnection = hasPendingConnection && manualConnectLocked;
  const isRestoringConnection =
    hasPendingConnection && !isManualConnection && input.suppressRestoringConnection !== true;

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
