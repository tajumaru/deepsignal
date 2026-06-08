import { useMemo } from "react";
import { useWalletProviderRuntime } from "./components/WalletSurfaceRuntime";
import { useOptionalWalletConnection } from "./walletStatus";

export type CanonicalWalletStatus =
  | "booting"
  | "provider_pending"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface CanonicalWalletSessionState {
  accountAddress: string | null;
  canonicalStatus: CanonicalWalletStatus;
  connectLockState: "idle" | "manual_connecting" | "auto_restoring";
  connectMode: "manual" | "autoRestore" | null;
  connectionStatus: "connecting" | "disconnected" | "connected";
  isRestoringConnection: boolean;
  providerLoading: boolean;
  providerMounted: boolean;
  walletName: string | null;
}

export function selectCanonicalWalletSessionState(
  input: Omit<CanonicalWalletSessionState, "canonicalStatus">,
): CanonicalWalletSessionState {
  const hasConnectedAccount = Boolean(input.accountAddress);
  const canonicalStatus: CanonicalWalletStatus = !input.providerMounted
    ? input.providerLoading
      ? "provider_pending"
      : "booting"
    : hasConnectedAccount
      ? "connected"
      : input.connectionStatus === "connecting" || input.connectLockState !== "idle"
        ? "connecting"
        : "disconnected";

  return {
    ...input,
    canonicalStatus,
  };
}

export function useCanonicalWalletSessionState() {
  const walletRuntime = useWalletProviderRuntime();
  const connection = useOptionalWalletConnection();

  return useMemo(
    () =>
      selectCanonicalWalletSessionState({
        accountAddress: connection.accountAddress,
        connectLockState: connection.connectLockState,
        connectMode: connection.connectMode,
        connectionStatus: connection.status,
        isRestoringConnection: connection.isRestoringConnection,
        providerLoading: walletRuntime.loading || (walletRuntime.chunkLoaded && !walletRuntime.contextAvailable),
        providerMounted: walletRuntime.contextAvailable,
        walletName: connection.walletName,
      }),
    [
      connection.accountAddress,
      connection.connectLockState,
      connection.connectMode,
      connection.isRestoringConnection,
      connection.status,
      connection.walletName,
      walletRuntime.chunkLoaded,
      walletRuntime.contextAvailable,
      walletRuntime.loading,
    ],
  );
}
