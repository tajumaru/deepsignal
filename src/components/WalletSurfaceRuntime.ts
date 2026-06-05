import { createContext, useContext } from "react";

export type WalletProviderRuntime = {
  loaded: boolean;
  loading: boolean;
  requestLoad: () => void;
};

const WalletSurfaceContext = createContext<WalletProviderRuntime>({
  loaded: false,
  loading: false,
  requestLoad: () => undefined,
});

export function useWalletProviderRuntime() {
  return useContext(WalletSurfaceContext);
}

export { WalletSurfaceContext };
