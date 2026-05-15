import { lazy, Suspense, useEffect, useState } from "react";
import { WalletSurface } from "../../../components/WalletSurface";
import { WalrusRuntimeSurface } from "../../../components/WalrusRuntimeSurface";
import { retryLazyImport } from "../../../lib/lazyRetry";

const PublicWalletAccountPanel = lazy(() =>
  retryLazyImport(() => import("./PublicWalletAccountPanel")).then((module) => ({
    default: module.PublicWalletAccountPanel,
  })),
);

interface PublicIdentityCardProps {
  walletRequired: boolean;
  accountAddress?: string;
  attachWallet: boolean;
  deadlinePassed: boolean;
  onAttachWalletChange: (attached: boolean) => void;
  onAttachWalletTouched: () => void;
  onAccountAddressChange: (address?: string) => void;
  labels: {
    eyebrow: string;
    title: string;
    body: string;
    sendMode: string;
    walletRequired: string;
    walletAttach: string;
    walletRequiredConnectedHelp: string;
    walletRequiredHelp: string;
    walletAttachHelp: string;
    walletConnectOptional: string;
    currentMode: string;
    modeWallet: string;
    modeAnonymous: string;
    walletModeHelpNoSignature: string;
    anonymousModeHelp: string;
  };
}

export function PublicIdentityCard({
  walletRequired,
  accountAddress,
  attachWallet,
  deadlinePassed,
  onAttachWalletChange,
  onAttachWalletTouched,
  onAccountAddressChange,
  labels,
}: PublicIdentityCardProps) {
  const [walletRequested, setWalletRequested] = useState(walletRequired);

  useEffect(() => {
    if (walletRequired) {
      setWalletRequested(true);
    }
  }, [walletRequired]);

  const walletFallback = <div className="wallet-connect-shell wallet-connect-shell-compact" />;

  return (
    <section className="answer-card public-identity-card">
      <div className="public-identity-topline">
        <div className="public-identity-copy">
          <p className="eyebrow">{labels.eyebrow}</p>
          <h3>{labels.title}</h3>
          <p className="muted">{labels.body}</p>
        </div>
        <div className="public-identity-wallet">
          {walletRequested ? (
            <WalletSurface fallback={walletFallback}>
              <WalrusRuntimeSurface fallback={walletFallback}>
                <Suspense fallback={walletFallback}>
                  <PublicWalletAccountPanel onAccountAddressChange={onAccountAddressChange} />
                </Suspense>
              </WalrusRuntimeSurface>
            </WalletSurface>
          ) : (
            <div className="wallet-connect-shell wallet-connect-shell-compact">
              <div className="wallet-connect-direct panel">
                <div className="wallet-connect-direct-copy">
                  <strong>{labels.walletAttach}</strong>
                  <span>{labels.walletConnectOptional}</span>
                </div>
                <button type="button" className="wallet-sync-button" onClick={() => setWalletRequested(true)}>
                  {labels.walletAttach}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="public-identity-grid">
        <div className="public-identity-mode">
          <span className="public-identity-label">{labels.sendMode}</span>
          <label className="public-identity-toggle">
            <input
              type="checkbox"
              checked={attachWallet}
              disabled={walletRequired || !accountAddress || deadlinePassed}
              onChange={(event) => {
                onAttachWalletTouched();
                onAttachWalletChange(event.target.checked);
              }}
            />
            <span>
              <strong>{walletRequired ? labels.walletRequired : labels.walletAttach}</strong>
              <small>
                {walletRequired
                  ? accountAddress
                    ? labels.walletRequiredConnectedHelp
                    : labels.walletRequiredHelp
                  : accountAddress
                    ? labels.walletAttachHelp
                    : labels.walletConnectOptional}
              </small>
            </span>
          </label>
        </div>

        <div className="public-identity-note">
          <span className="public-identity-label">{labels.currentMode}</span>
          <strong>{walletRequired || (attachWallet && accountAddress) ? labels.modeWallet : labels.modeAnonymous}</strong>
          <p className="muted">
            {walletRequired
              ? accountAddress
                ? labels.walletRequiredConnectedHelp
                : labels.walletRequiredHelp
              : attachWallet && accountAddress
                ? labels.walletModeHelpNoSignature
                : labels.anonymousModeHelp}
          </p>
        </div>
      </div>
    </section>
  );
}
