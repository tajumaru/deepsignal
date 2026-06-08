import { useCallback, useMemo, useState } from "react";
import { shortAddress } from "../lib/sui";
import { useSuiName } from "./useSuiName";
import {
  useOptionalWalletActions,
  useOptionalWalletConnection,
} from "../walletStatus";

export type SuiWalletConnectionStatus =
  | "connecting"
  | "disconnected"
  | "connected"
  | "error"
  | "booting"
  | "provider_pending";

export interface SuiWalletState {
  account: { address: string } | null;
  accountAddress?: string;
  walletName?: string;
  status: SuiWalletConnectionStatus;
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isProviderPending: boolean;
  isRestoringConnection: boolean;
  connectLockState: "idle" | "manual_connecting" | "auto_restoring";
  connectMode: "manual" | "autoRestore" | null;
  lastConnectFailure: import("../walletStatus").WalletConnectFailureState | null;
  displayName: string;
  suinsName: string | null;
  shortAddressLabel: string;
  error: Error | null;
  disconnect: () => Promise<void>;
  copyAddress: () => Promise<void>;
}

export function useSuiWallet(options: { resolveName?: boolean } = {}): SuiWalletState {
  const connection = useOptionalWalletConnection();
  const actions = useOptionalWalletActions();
  const account = useMemo(
    () => (connection.accountAddress ? { address: connection.accountAddress } : null),
    [connection.accountAddress],
  );
  const { data: suinsName = null } = useSuiName(account?.address, {
    enabled: options.resolveName ?? true,
  });
  const [error, setError] = useState<Error | null>(null);

  const accountAddress = account?.address;
  const isRestoringConnection = connection.isRestoringConnection;
  const shortAddressLabel = accountAddress ? shortAddress(accountAddress) : "";
  const displayName = (suinsName ?? shortAddressLabel) || connection.walletName || "";
  const status: SuiWalletConnectionStatus = error
    ? "error"
    : isRestoringConnection
      ? "connecting"
      : accountAddress
        ? "connected"
        : "disconnected";
  const hasConnectedAccount = status === "connected";
  const isConnecting = connection.status === "connecting";

  const disconnect = useCallback(async () => {
    try {
      setError(null);
      await actions.disconnect();
    } catch (disconnectError) {
      const nextError =
        disconnectError instanceof Error
          ? disconnectError
          : new Error("Wallet disconnect failed.");
      setError(nextError);
      throw nextError;
    }
  }, [actions]);

  const copyAddress = useCallback(async () => {
    if (!accountAddress) {
      return;
    }
    try {
      setError(null);
      await navigator.clipboard.writeText(accountAddress);
    } catch (copyError) {
      const nextError = copyError instanceof Error ? copyError : new Error("Wallet address copy failed.");
      setError(nextError);
      throw nextError;
    }
  }, [accountAddress]);

  return useMemo(
    () => ({
      account,
      accountAddress,
      walletName: connection.walletName ?? undefined,
      status,
      isConnected: hasConnectedAccount,
      isConnecting,
      isDisconnecting: false,
      isProviderPending: false,
      isRestoringConnection,
      connectLockState: connection.connectLockState,
      connectMode: connection.connectMode,
      lastConnectFailure: connection.lastConnectFailure,
      displayName,
      suinsName,
      shortAddressLabel,
      error,
      disconnect,
      copyAddress,
    }),
    [
      account,
      accountAddress,
      connection.walletName,
      status,
      hasConnectedAccount,
      isConnecting,
      isRestoringConnection,
      connection.connectLockState,
      connection.connectMode,
      connection.lastConnectFailure,
      displayName,
      suinsName,
      shortAddressLabel,
      error,
      disconnect,
      copyAddress,
    ],
  );
}
