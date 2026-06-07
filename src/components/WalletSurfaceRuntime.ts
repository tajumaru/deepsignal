import { createContext, useContext } from "react";

export type WalletProviderRuntime = {
  chunkLoaded: boolean;
  contextAvailable: boolean;
  failed: boolean;
  hasCommittedOnce: boolean;
  loaded: boolean;
  loading: boolean;
  markContextAvailable: () => void;
  markTreeMounted: () => void;
  requestLoad: () => void;
  resetReadiness: () => void;
  treeMounted: boolean;
};

const defaultWalletProviderRuntime: WalletProviderRuntime = {
  chunkLoaded: false,
  contextAvailable: false,
  failed: false,
  hasCommittedOnce: false,
  loaded: false,
  loading: false,
  markContextAvailable: () => undefined,
  markTreeMounted: () => undefined,
  requestLoad: () => undefined,
  resetReadiness: () => undefined,
  treeMounted: false,
};

let walletProviderRuntimeSnapshot: WalletProviderRuntime = defaultWalletProviderRuntime;

const WalletSurfaceContext = createContext<WalletProviderRuntime>(defaultWalletProviderRuntime);

export function useWalletProviderRuntime() {
  return useContext(WalletSurfaceContext);
}

export function setWalletProviderRuntimeSnapshot(nextValue: WalletProviderRuntime) {
  walletProviderRuntimeSnapshot = nextValue;
}

export function getWalletProviderRuntimeSnapshot() {
  return walletProviderRuntimeSnapshot;
}

export { WalletSurfaceContext };
