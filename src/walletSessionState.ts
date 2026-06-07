import { useSyncExternalStore } from "react";
import type { CanonicalWalletStatus } from "./walletCanonicalState";

export type WalletSessionPhase = "provider_deferred" | "restoring" | "disconnected" | "connected";

export interface WalletSessionState {
  accountAddress: string | null;
  canonicalStatus: CanonicalWalletStatus;
  isRestoringConnection: boolean;
  phase: WalletSessionPhase;
  providerLoading: boolean;
  providerMounted: boolean;
  status: "connecting" | "disconnected" | "connected";
  walletName: string | null;
}

export const defaultWalletSessionState: WalletSessionState = {
  accountAddress: null,
  canonicalStatus: "booting",
  isRestoringConnection: false,
  phase: "provider_deferred",
  providerLoading: false,
  providerMounted: false,
  status: "disconnected",
  walletName: null,
};

let walletSessionState = defaultWalletSessionState;
const walletSessionListeners = new Set<() => void>();

function walletSessionStatesEqual(left: WalletSessionState, right: WalletSessionState) {
  return (
    left.accountAddress === right.accountAddress &&
    left.canonicalStatus === right.canonicalStatus &&
    left.isRestoringConnection === right.isRestoringConnection &&
    left.phase === right.phase &&
    left.providerLoading === right.providerLoading &&
    left.providerMounted === right.providerMounted &&
    left.status === right.status &&
    left.walletName === right.walletName
  );
}

export function setWalletSessionState(nextState: WalletSessionState) {
  if (walletSessionStatesEqual(walletSessionState, nextState)) {
    return;
  }
  walletSessionState = nextState;
  walletSessionListeners.forEach((listener) => listener());
}

export function getWalletSessionStateSnapshot() {
  return walletSessionState;
}

export function subscribeWalletSessionState(listener: () => void) {
  walletSessionListeners.add(listener);
  return () => {
    walletSessionListeners.delete(listener);
  };
}

export function useWalletSessionState() {
  return useSyncExternalStore(
    subscribeWalletSessionState,
    getWalletSessionStateSnapshot,
    getWalletSessionStateSnapshot,
  );
}
