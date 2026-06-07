import { useCallback, useMemo, useState } from "react";
import { shortAddress } from "../lib/sui";
import { useSuiName } from "./useSuiName";
import {
  useOptionalWalletActions,
  useOptionalWalletConnection,
  type WalletConnectFailureState,
  type WalletConnectLockState,
  type WalletConnectMode,
} from "../walletStatus";
import { useCanonicalWalletSessionState, type CanonicalWalletStatus } from "../walletCanonicalState";

export type SuiWalletConnectionStatus = CanonicalWalletStatus;

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
  connectLockState: WalletConnectLockState;
  connectMode: WalletConnectMode;
  lastConnectFailure: WalletConnectFailureState | null;
  displayName: string;
  suinsName: string | null;
  shortAddressLabel: string;
  error: Error | null;
  disconnect: () => Promise<void>;
  copyAddress: () => Promise<void>;
}

export function useSuiWallet(options: { resolveName?: boolean } = {}): SuiWalletState {
  const session = useCanonicalWalletSessionState();
  const actions = useOptionalWalletActions();
  const connection = useOptionalWalletConnection();
  const account = useMemo(
    () => (session.accountAddress ? { address: session.accountAddress } : null),
    [session.accountAddress],
  );
  const { data: suinsName = null } = useSuiName(account?.address, {
    enabled: options.resolveName ?? true,
  });
  const [error, setError] = useState<Error | null>(null);

  const accountAddress = account?.address;
  const isRestoringConnection = session.isRestoringConnection;
  const connectMode = session.connectMode;
  const connectLockState = session.connectLockState;
  const shortAddressLabel = accountAddress ? shortAddress(accountAddress) : "";
  const displayName = (suinsName ?? shortAddressLabel) || session.walletName || "";
  const status: SuiWalletConnectionStatus = error ? "error" : session.canonicalStatus;
  const hasConnectedAccount = status === "connected" && Boolean(accountAddress);
  const isProviderPending = status === "booting" || status === "provider_pending";
  const isConnecting = isProviderPending || status === "connecting";

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
      walletName: session.walletName ?? undefined,
      status,
      isConnected: hasConnectedAccount,
      isConnecting,
      isDisconnecting: false,
      isProviderPending,
      isRestoringConnection,
      connectLockState,
      connectMode,
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
      session.walletName,
      status,
      hasConnectedAccount,
      isConnecting,
      isProviderPending,
      isRestoringConnection,
      connectLockState,
      connectMode,
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
