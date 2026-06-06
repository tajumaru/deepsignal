import type { WalletConnectionState } from "./walletStatus";

export function deriveWalletConnectionState(input: {
  accountAddress: string | null | undefined;
  connectionStatus: "connecting" | "disconnected" | "connected";
  currentWalletName: string | null | undefined;
  fallbackAccounts?: readonly { address: string }[] | null;
  isConnected: boolean;
}): WalletConnectionState {
  const accountAddress = input.accountAddress ?? input.fallbackAccounts?.[0]?.address ?? null;
  const isRestoringConnection = input.connectionStatus === "connecting";

  return {
    status: isRestoringConnection ? "connecting" : input.isConnected && accountAddress ? "connected" : "disconnected",
    accountAddress,
    walletName: input.currentWalletName ?? null,
    isRestoringConnection,
  };
}
