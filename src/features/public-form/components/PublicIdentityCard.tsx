import { Component, Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
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
  onWalletProviderChange?: (provider?: string) => void;
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
    walletUnavailable: string;
    walletUnavailableRequired: string;
    walletRetry: string;
  };
}

class PublicWalletSurfaceBoundary extends Component<
  {
    children: ReactNode;
    fallback: (options: { retry: () => void }) => ReactNode;
  },
  { error: Error | null; retryNonce: number }
> {
  state = { error: null, retryNonce: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("DeepSignal public wallet surface failed to render.", error);
  }

  retry = () => {
    this.setState((current) => ({
      error: null,
      retryNonce: current.retryNonce + 1,
    }));
  };

  render() {
    if (this.state.error) {
      return this.props.fallback({ retry: this.retry });
    }

    return <Fragment key={this.state.retryNonce}>{this.props.children}</Fragment>;
  }
}

export function PublicIdentityCard({
  walletRequired,
  accountAddress,
  attachWallet,
  deadlinePassed,
  onAttachWalletChange,
  onAttachWalletTouched,
  onAccountAddressChange,
  onWalletProviderChange,
  labels,
}: PublicIdentityCardProps) {
  const [walletRequested, setWalletRequested] = useState(walletRequired);

  useEffect(() => {
    if (walletRequired) {
      setWalletRequested(true);
    }
  }, [walletRequired]);

  const walletFallback = <div className="wallet-connect-shell wallet-connect-shell-compact" />;
  const walletUnavailableCopy = walletRequired ? labels.walletUnavailableRequired : labels.walletUnavailable;

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
            <PublicWalletSurfaceBoundary
              fallback={({ retry }) => (
                <div className="wallet-connect-shell wallet-connect-shell-compact">
                  <div className="wallet-connect-direct panel">
                    <div className="wallet-connect-direct-copy">
                      <strong>{labels.walletRequired}</strong>
                      <span>{walletUnavailableCopy}</span>
                    </div>
                    <button type="button" className="wallet-sync-button" onClick={retry}>
                      {labels.walletRetry}
                    </button>
                  </div>
                </div>
              )}
            >
              <WalletSurface fallback={walletFallback}>
                <WalrusRuntimeSurface fallback={walletFallback}>
                  <Suspense fallback={walletFallback}>
                    <PublicWalletAccountPanel
                      onAccountAddressChange={onAccountAddressChange}
                      onWalletProviderChange={onWalletProviderChange}
                    />
                  </Suspense>
                </WalrusRuntimeSurface>
              </WalletSurface>
            </PublicWalletSurfaceBoundary>
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

      <div className={`public-identity-grid ${walletRequired ? "is-wallet-required" : ""}`}>
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

        {!walletRequired ? (
          <div className="public-identity-note">
            <span className="public-identity-label">{labels.currentMode}</span>
            <strong>{attachWallet && accountAddress ? labels.modeWallet : labels.modeAnonymous}</strong>
            <p className="muted">{attachWallet && accountAddress ? labels.walletModeHelpNoSignature : labels.anonymousModeHelp}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
