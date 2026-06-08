import { createContext, useContext } from "react";

type WalletProviderResetState = {
  remountWalletProvider: () => void;
};

const defaultWalletProviderResetState: WalletProviderResetState = {
  remountWalletProvider: () => undefined,
};

export const WalletProviderResetContext = createContext<WalletProviderResetState>(defaultWalletProviderResetState);

export function useWalletProviderReset() {
  return useContext(WalletProviderResetContext);
}
