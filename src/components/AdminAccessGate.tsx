import { useAutoConnectWallet } from "@mysten/dapp-kit";
import type { PropsWithChildren } from "react";
import { useI18n } from "../i18n";
import { WalletConnect } from "./WalletConnect";

interface AdminAccessGateProps extends PropsWithChildren {
  hasWallet: boolean;
  access: "allowed" | "legacy" | "denied";
  legacyMessage?: string;
  deniedTitle?: string;
  deniedBody?: string;
}

export function AdminAccessGate({
  hasWallet,
  access,
  legacyMessage,
  deniedTitle,
  deniedBody,
  children,
}: AdminAccessGateProps) {
  const { t } = useI18n();
  const autoConnectStatus = useAutoConnectWallet();

  if (!hasWallet && autoConnectStatus === "idle") {
    return <div className="panel">{t("checkingWalletCapabilities")}</div>;
  }

  if (!hasWallet) {
    return (
      <section className="panel glow-panel access-panel">
        <p className="eyebrow">{t("creatorOnlyInbox")}</p>
        <h1>{t("connectWalletTitle")}</h1>
        <p>{t("walletVerifiedAccessRequired")}</p>
        <div className="inline-actions">
          <WalletConnect />
        </div>
      </section>
    );
  }

  if (access === "denied") {
    return (
      <section className="panel glow-panel access-panel">
        <p className="eyebrow">{t("creatorOnlyInbox")}</p>
        <h1>{deniedTitle ?? t("accessDeniedTitle")}</h1>
        <p>{deniedBody ?? t("accessDeniedBody")}</p>
      </section>
    );
  }

  return (
    <>
      {access === "legacy" ? (
        <section className="panel access-panel legacy-panel">
          <p className="eyebrow">{t("legacyDemoForm")}</p>
          <p>{legacyMessage ?? t("legacyDemoFormBody")}</p>
        </section>
      ) : null}
      {children}
    </>
  );
}
