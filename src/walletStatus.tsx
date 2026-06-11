import { createContext, useContext } from "react";
import type { CreateFormTransaction } from "./features/createForm/types";

export type WalletConnectionStatus = "connecting" | "disconnected" | "connected";
export type WalletConnectMode = "manual" | "autoRestore" | null;
export type WalletConnectLockState = "idle" | "manual_connecting" | "auto_restoring";
export type WalletConnectFailureSource = "wallet_adapter" | "slush_injected_provider" | "dapp_kit" | "wrapper" | "unknown";
export type WalletConnectFailureClassification = "slush_dapp_registration_failed" | "slush_connect_no_result" | "generic";

export interface WalletConnectFailureState {
  classification: WalletConnectFailureClassification;
  message: string;
  source: WalletConnectFailureSource;
  requiresSlushRecovery: boolean;
  userMessage: string | null;
  selectedWalletId?: string | null;
  selectedWalletName?: string | null;
}

export interface WalletConnectionState {
  status: WalletConnectionStatus;
  accountAddress: string | null;
  walletName: string | null;
  isRestoringConnection: boolean;
  connectMode: WalletConnectMode;
  connectLockState: WalletConnectLockState;
  lastConnectFailure: WalletConnectFailureState | null;
}

export interface WalletActionState {
  disconnect: () => Promise<void>;
  signAndExecuteTransaction: (transaction: CreateFormTransaction) => Promise<{ digest: string }>;
  signPersonalMessage: (message: Uint8Array) => Promise<string>;
}

export interface WalletRuntimeControlState {
  beginManualConnect: () => void;
  cancelManualConnect: () => void;
  clearConnectFailure: () => void;
  suppressAutoRestore: () => void;
}

const defaultWalletConnectionState: WalletConnectionState = {
  status: "disconnected",
  accountAddress: null,
  walletName: null,
  isRestoringConnection: false,
  connectMode: null,
  connectLockState: "idle",
  lastConnectFailure: null,
};

const defaultWalletActionState: WalletActionState = {
  disconnect: async () => undefined,
  signAndExecuteTransaction: async () => {
    throw new Error("Wallet provider is not loaded.");
  },
  signPersonalMessage: async () => {
    throw new Error("Wallet provider is not loaded.");
  },
};

const defaultWalletRuntimeControlState: WalletRuntimeControlState = {
  beginManualConnect: () => undefined,
  cancelManualConnect: () => undefined,
  clearConnectFailure: () => undefined,
  suppressAutoRestore: () => undefined,
};

export const WalletConnectionContext = createContext<WalletConnectionState>(defaultWalletConnectionState);
export const WalletActionContext = createContext<WalletActionState>(defaultWalletActionState);
export const WalletRuntimeControlContext = createContext<WalletRuntimeControlState>(defaultWalletRuntimeControlState);

export function useOptionalWalletConnection() {
  return useContext(WalletConnectionContext);
}

export function useOptionalWalletActions() {
  return useContext(WalletActionContext);
}

export function useWalletRuntimeControls() {
  return useContext(WalletRuntimeControlContext);
}
