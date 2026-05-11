import type { Translate } from "../types";

interface InfoStepProps {
  t: Translate;
  title: string;
  description: string;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function InfoStep({
  t,
  title,
  description,
  setTitle,
  setDescription,
  onBack,
  onContinue,
}: InfoStepProps) {
  return (
    <section className="panel composer-section-card composer-step-card">
      <div className="section-row">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>{t("basicInfoTitle")}</h2>
          <p className="muted">Keep this short for the demo. Title and description are enough to publish a private signal form.</p>
        </div>
      </div>

      <section className="answer-card contest-builder-quickstart">
        <div className="section-row">
          <div>
            <p className="eyebrow">Contest Defaults</p>
            <h3>Private Signal ready</h3>
          </div>
          <span className="signal-chip signal-chip-accent">Encrypt submissions ON</span>
        </div>
        <p className="muted">
          Advanced settings stay tucked away until publish. You can create the form now and share the public link right after.
        </p>
      </section>

      <div className="composer-info-grid">
        <label>
          <span>{t("formTitle")}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className="composer-info-intro">
          <span>{t("description")}</span>
          <textarea
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("builderDescriptionPlaceholder")}
          />
        </label>
      </div>

      <div className="composer-step-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          {t("back")}
        </button>
        <button type="button" className="primary-button" onClick={onContinue}>
          {t("continue")}
        </button>
      </div>
    </section>
  );
}
