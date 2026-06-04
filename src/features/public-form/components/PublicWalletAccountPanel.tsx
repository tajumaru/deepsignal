import { useEffect } from "react";
import { WalletConnectSurface } from "../../../components/WalletConnectSurface";
import { useSuiWallet } from "../../../hooks/useSuiWallet";

interface PublicWalletAccountPanelProps {
  onAccountAddressChange: (address?: string) => void;
  onWalletProviderChange?: (provider?: string) => void;
}

export function PublicWalletAccountPanel({ onAccountAddressChange, onWalletProviderChange }: PublicWalletAccountPanelProps) {
  const wallet = useSuiWallet();

  useEffect(() => {
    onAccountAddressChange(wallet.accountAddress);
  }, [wallet.accountAddress, onAccountAddressChange]);

  useEffect(() => {
    onWalletProviderChange?.(wallet.walletName);
  }, [wallet.walletName, onWalletProviderChange]);

  useEffect(
    () => () => {
      onAccountAddressChange(undefined);
      onWalletProviderChange?.(undefined);
    },
    [onAccountAddressChange, onWalletProviderChange],
  );

  return <WalletConnectSurface compact />;
}
