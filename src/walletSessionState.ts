import { createContext, useContext } from "react";

export type WalletSessionPhase = "provider_deferred" | "restoring" | "disconnected" | "connected";

export interface WalletSessionState {
  accountAddress: string | null;
  isRestoringConnection: boolean;
  phase: WalletSessionPhase;
  providerLoading: boolean;
  providerMounted: boolean;
  status: "connecting" | "disconnected" | "connected";
  walletName: string | null;
}

export const defaultWalletSessionState: WalletSessionState = {
  accountAddress: null,
  isRestoringConnection: false,
  phase: "provider_deferred",
  providerLoading: false,
  providerMounted: false,
  status: "disconnected",
  walletName: null,
};

export const WalletSessionContext = createContext<WalletSessionState>(defaultWalletSessionState);

export function useWalletSessionState() {
  return useContext(WalletSessionContext);
}
