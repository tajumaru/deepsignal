import { createContext, useContext } from "react";

export type WalletConnectionStatus = "connecting" | "disconnected" | "connected";

export interface WalletConnectionState {
  status: WalletConnectionStatus;
  accountAddress: string | null;
  walletName: string | null;
  isRestoringConnection: boolean;
}

const defaultWalletConnectionState: WalletConnectionState = {
  status: "disconnected",
  accountAddress: null,
  walletName: null,
  isRestoringConnection: false,
};

export const WalletConnectionContext = createContext<WalletConnectionState>(defaultWalletConnectionState);

export function useOptionalWalletConnection() {
  return useContext(WalletConnectionContext);
}
