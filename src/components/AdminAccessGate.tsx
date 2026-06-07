import { lazy, Suspense, type PropsWithChildren } from "react";
import { useI18n } from "../i18n";
import { retryLazyImport } from "../lib/lazyRetry";

const LazyWalletConnectSurface = lazy(() =>
  retryLazyImport(() => import("./WalletConnectSurface"), "admin-gate-wallet-connect-surface").then((module) => ({
    default: module.WalletConnectSurface,
  })),
);

function AdminGateWalletConnectFallback() {
  return <div className="wallet-connect-shell wallet-connect-shell-compact" aria-hidden="true" />;
}

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

  if (!hasWallet) {
    return (
      <section className="panel glow-panel access-panel">
        <p className="eyebrow">{t("creatorOnlyInbox")}</p>
        <h1>{t("connectWalletTitle")}</h1>
        <p>{t("walletVerifiedAccessRequired")}</p>
        <div className="inline-actions">
          <Suspense fallback={<AdminGateWalletConnectFallback />}>
            <LazyWalletConnectSurface context="adminGate" />
          </Suspense>
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
