interface PublicSubmitReadinessProps {
  identityMode: "anonymous" | "wallet";
  sealEnabled: boolean;
  submitModeLabel: string;
  storageModeLabel: string;
  className?: string;
  labels: {
    summary: string;
    deliveryMode: string;
    anonymous: string;
    suiWallet: string;
    storageTarget: string;
    walrus: string;
    walrusIcon: string;
    seal: string;
    sealOn: string;
    sealOff: string;
    attachments: string;
    attachmentsHelp: string;
  };
}

export function PublicSubmitReadiness({
  identityMode,
  sealEnabled,
  submitModeLabel,
  storageModeLabel,
  className = "",
  labels,
}: PublicSubmitReadinessProps) {
  return (
    <section
      className={`answer-card public-submit-readiness ${className}`.trim()}
      aria-label={labels.summary}
      title={`${labels.deliveryMode}: ${submitModeLabel}. ${labels.storageTarget}: ${storageModeLabel}. ${labels.attachments}: ${labels.attachmentsHelp}`}
    >
      <div className="public-submit-badge-grid">
        <span className={`public-submit-badge is-${identityMode}`}>
          <span className="public-submit-badge-icon" aria-hidden="true">
            {identityMode === "wallet" ? "Sui" : "Anon"}
          </span>
          <span>
            <small>{labels.deliveryMode}</small>
            <strong>{identityMode === "wallet" ? labels.suiWallet : labels.anonymous}</strong>
          </span>
        </span>
        <span className="public-submit-badge is-walrus">
          <span className="public-submit-badge-icon" aria-hidden="true">
            {labels.walrusIcon}
          </span>
          <span>
            <small>{labels.storageTarget}</small>
            <strong>{labels.walrus}</strong>
          </span>
        </span>
        <span className={`public-submit-badge ${sealEnabled ? "is-seal-on" : "is-seal-off"}`}>
          <span className="public-submit-badge-icon" aria-hidden="true">
            Seal
          </span>
          <span>
            <small>{labels.seal}</small>
            <strong>{sealEnabled ? labels.sealOn : labels.sealOff}</strong>
          </span>
        </span>
      </div>
    </section>
  );
}
