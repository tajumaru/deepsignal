import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useI18n } from "../i18n";
import { SignalMetaChip } from "./SignalMetaChip";

export function WalletConnect() {
  const account = useCurrentAccount();
  const { t } = useI18n();

  return (
    <div className="wallet-connect">
      <ConnectButton />
      {account?.address ? (
        <div className="wallet-address-chip">
          <span>{t("connectedLabel")}</span>
          <SignalMetaChip type="contributor" value={account.address} />
        </div>
      ) : null}
    </div>
  );
}
