import { useEffect } from "react";
import { WalletConnect } from "../../../components/WalletConnect";
import { useSuiWallet } from "../../../hooks/useSuiWallet";

interface PublicWalletAccountPanelProps {
  onAccountAddressChange: (address?: string) => void;
  onWalletProviderChange?: (provider?: string) => void;
}

export function PublicWalletAccountPanel({ onAccountAddressChange, onWalletProviderChange }: PublicWalletAccountPanelProps) {
  const wallet = useSuiWallet();

  useEffect(() => {
    onAccountAddressChange(wallet.accountAddress);
    return () => onAccountAddressChange(undefined);
  }, [wallet.accountAddress, onAccountAddressChange]);

  useEffect(() => {
    onWalletProviderChange?.(wallet.walletName);
    return () => onWalletProviderChange?.(undefined);
  }, [wallet.walletName, onWalletProviderChange]);

  return <WalletConnect compact />;
}
