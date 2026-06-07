import { lazy, Suspense, useMemo, useState, type PropsWithChildren } from "react";
import { useI18n } from "../i18n";
import { retryLazyImport } from "../lib/lazyRetry";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { SafeLazyBoundary } from "./SafeLazyBoundary";

function AdminGateWalletConnectFallback() {
  return <div className="wallet-connect-shell wallet-connect-shell-compact" aria-hidden="true" />;
}

function AdminGateWalletConnectRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="wallet-connect-shell wallet-connect-shell-compact">
      <div className="wallet-connect-direct panel">
        <div className="wallet-connect-direct-copy">
          <strong>Wallet panel could not load</strong>
          <span>Retry only the wallet area. Workspace access checks stay available.</span>
        </div>
        <div className="wallet-connect-actions">
          <button type="button" className="wallet-connect-trigger" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
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
  const [retryNonce, setRetryNonce] = useState(0);
  const LazyWalletConnectSurface = useMemo(
    () =>
      lazy(() =>
        retryLazyImport(() => import("./WalletConnectSurface"), "admin-gate-wallet-connect-surface").then((module) => ({
          default: module.WalletConnectSurface,
        })),
      ),
    [retryNonce],
  );

  if (!hasWallet) {
    return (
      <section className="panel glow-panel access-panel">
        <p className="eyebrow">{t("creatorOnlyInbox")}</p>
        <h1>{t("connectWalletTitle")}</h1>
        <p>{t("walletVerifiedAccessRequired")}</p>
        <div className="inline-actions">
          <SafeLazyBoundary
            fallback={<AdminGateWalletConnectRetry onRetry={() => setRetryNonce((value) => value + 1)} />}
            onError={(error, errorInfo) => {
              logRouteLifecycle("wallet-ui-lazy-failure-contained", {
                label: "admin-gate-wallet-connect-surface",
                componentStack: errorInfo.componentStack,
                error,
                fatal: false,
              });
            }}
            resetKey={`admin-gate-wallet:${retryNonce}`}
          >
            <Suspense fallback={<AdminGateWalletConnectFallback />}>
              <LazyWalletConnectSurface context="adminGate" />
            </Suspense>
          </SafeLazyBoundary>
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
