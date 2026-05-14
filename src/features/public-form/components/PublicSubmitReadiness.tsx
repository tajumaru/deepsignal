interface PublicSubmitReadinessProps {
  submitModeLabel: string;
  storageModeLabel: string;
}

export function PublicSubmitReadiness({
  submitModeLabel,
  storageModeLabel,
}: PublicSubmitReadinessProps) {
  return (
    <section className="answer-card public-submit-readiness">
      <div className="metadata-list">
        <div className="metadata-row">
          <span>Delivery mode</span>
          <strong>{submitModeLabel}</strong>
        </div>
        <div className="metadata-row">
          <span>Storage target</span>
          <strong>{storageModeLabel}</strong>
        </div>
        <div className="metadata-row">
          <span>Attachments</span>
          <strong>Preview before submit. Failed uploads stay visible until you remove or replace them.</strong>
        </div>
      </div>
    </section>
  );
}
