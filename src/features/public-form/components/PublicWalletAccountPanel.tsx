import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect } from "react";
import { WalletConnect } from "../../../components/WalletConnect";

interface PublicWalletAccountPanelProps {
  onAccountAddressChange: (address?: string) => void;
}

export function PublicWalletAccountPanel({ onAccountAddressChange }: PublicWalletAccountPanelProps) {
  const account = useCurrentAccount();

  useEffect(() => {
    onAccountAddressChange(account?.address);
    return () => onAccountAddressChange(undefined);
  }, [account?.address, onAccountAddressChange]);

  return <WalletConnect compact />;
}
