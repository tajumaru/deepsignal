import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useI18n } from "../i18n";
import { shortAddress } from "../lib/sui";

export function WalletConnect() {
  const account = useCurrentAccount();
  const { t } = useI18n();

  return (
    <div className="wallet-connect">
      <ConnectButton />
      {account?.address ? (
        <div className="wallet-address-chip">
          <span>{t("connectedLabel")}</span>
          <strong>{shortAddress(account.address)}</strong>
        </div>
      ) : null}
    </div>
  );
}
