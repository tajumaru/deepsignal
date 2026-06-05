import { createContext, useContext } from "react";
import type { CreateFormTransaction } from "./features/createForm/types";

export type WalletConnectionStatus = "connecting" | "disconnected" | "connected";

export interface WalletConnectionState {
  status: WalletConnectionStatus;
  accountAddress: string | null;
  walletName: string | null;
  isRestoringConnection: boolean;
}

export interface WalletActionState {
  disconnect: () => Promise<void>;
  signAndExecuteTransaction: (transaction: CreateFormTransaction) => Promise<{ digest: string }>;
}

const defaultWalletConnectionState: WalletConnectionState = {
  status: "disconnected",
  accountAddress: null,
  walletName: null,
  isRestoringConnection: false,
};

const defaultWalletActionState: WalletActionState = {
  disconnect: async () => undefined,
  signAndExecuteTransaction: async () => {
    throw new Error("Wallet provider is not loaded.");
  },
};

export const WalletConnectionContext = createContext<WalletConnectionState>(defaultWalletConnectionState);
export const WalletActionContext = createContext<WalletActionState>(defaultWalletActionState);

export function useOptionalWalletConnection() {
  return useContext(WalletConnectionContext);
}

export function useOptionalWalletActions() {
  return useContext(WalletActionContext);
}
