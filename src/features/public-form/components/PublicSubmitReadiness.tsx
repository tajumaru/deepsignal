interface PublicSubmitReadinessProps {
  submitModeLabel: string;
  storageModeLabel: string;
  labels: {
    deliveryMode: string;
    storageTarget: string;
    attachments: string;
    attachmentsHelp: string;
  };
}

export function PublicSubmitReadiness({
  submitModeLabel,
  storageModeLabel,
  labels,
}: PublicSubmitReadinessProps) {
  return (
    <section className="answer-card public-submit-readiness">
      <div className="metadata-list">
        <div className="metadata-row">
          <span>{labels.deliveryMode}</span>
          <strong>{submitModeLabel}</strong>
        </div>
        <div className="metadata-row">
          <span>{labels.storageTarget}</span>
          <strong>{storageModeLabel}</strong>
        </div>
        <div className="metadata-row">
          <span>{labels.attachments}</span>
          <strong>{labels.attachmentsHelp}</strong>
        </div>
      </div>
    </section>
  );
}
