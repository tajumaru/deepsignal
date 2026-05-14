import { lazy, Suspense } from "react";

const WalletConnect = lazy(() =>
  import("../../../components/WalletConnect").then((module) => ({ default: module.WalletConnect })),
);

interface PublicIdentityCardProps {
  walletRequired: boolean;
  accountAddress?: string;
  attachWallet: boolean;
  deadlinePassed: boolean;
  onAttachWalletChange: (attached: boolean) => void;
  onAttachWalletTouched: () => void;
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
  labels,
}: PublicIdentityCardProps) {
  return (
    <section className="answer-card public-identity-card">
      <div className="public-identity-topline">
        <div className="public-identity-copy">
          <p className="eyebrow">{labels.eyebrow}</p>
          <h3>{labels.title}</h3>
          <p className="muted">{labels.body}</p>
        </div>
        <div className="public-identity-wallet">
          <Suspense fallback={<div className="wallet-connect-shell wallet-connect-shell-compact" />}>
            <WalletConnect compact />
          </Suspense>
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
