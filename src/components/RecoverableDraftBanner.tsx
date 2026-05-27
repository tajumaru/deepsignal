interface RecoverableDraftBannerProps {
  title: string;
  description?: string;
  restoreLabel?: string;
  discardLabel?: string;
  onRestore?: () => void;
  onDiscard?: () => void;
}

export function RecoverableDraftBanner({
  title,
  description,
  restoreLabel,
  discardLabel,
  onRestore,
  onDiscard,
}: RecoverableDraftBannerProps) {
  return (
    <section className="answer-card recoverable-draft-banner" aria-live="polite">
      <div className="section-row">
        <div>
          <p className="eyebrow">Draft recovery</p>
          <h3>{title}</h3>
          {description ? <p className="muted">{description}</p> : null}
        </div>
      </div>
      <div className="inline-actions">
        {restoreLabel && onRestore ? (
          <button type="button" className="primary-button" onClick={onRestore}>
            {restoreLabel}
          </button>
        ) : null}
        {discardLabel && onDiscard ? (
          <button type="button" className="danger-button" onClick={onDiscard}>
            {discardLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
