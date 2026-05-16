import { useCurrentAccount, useCurrentWallet } from "@mysten/dapp-kit";
import { useEffect } from "react";
import { WalletConnect } from "../../../components/WalletConnect";

interface PublicWalletAccountPanelProps {
  onAccountAddressChange: (address?: string) => void;
  onWalletProviderChange?: (provider?: string) => void;
}

export function PublicWalletAccountPanel({ onAccountAddressChange, onWalletProviderChange }: PublicWalletAccountPanelProps) {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();

  useEffect(() => {
    onAccountAddressChange(account?.address);
    return () => onAccountAddressChange(undefined);
  }, [account?.address, onAccountAddressChange]);

  useEffect(() => {
    onWalletProviderChange?.(currentWallet?.name);
    return () => onWalletProviderChange?.(undefined);
  }, [currentWallet?.name, onWalletProviderChange]);

  return <WalletConnect compact />;
}
