import { toDateTimeLocalValue } from "../../../lib/responseDeadline";
import { RichTextEditor } from "../../../components/RichTextEditor";
import type { ResponseDeadlinePreset, Translate } from "../types";

interface InfoStepProps {
  t: Translate;
  title: string;
  description: string;
  responseDeadlinePreset: ResponseDeadlinePreset;
  responseDeadlineCustomAt: string;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setResponseDeadlinePreset: (value: ResponseDeadlinePreset) => void;
  setResponseDeadlineCustomAt: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function InfoStep({
  t,
  title,
  description,
  responseDeadlinePreset,
  responseDeadlineCustomAt,
  setTitle,
  setDescription,
  setResponseDeadlinePreset,
  setResponseDeadlineCustomAt,
  onBack,
  onContinue,
}: InfoStepProps) {
  const deadlineOptions: Array<{ value: ResponseDeadlinePreset; label: string }> = [
    { value: "none", label: "無期限" },
    { value: "1h", label: "1時間" },
    { value: "24h", label: "24時間" },
    { value: "7d", label: "7日" },
    { value: "30d", label: "30日" },
    { value: "custom", label: "カスタム日時" },
  ];

  return (
    <section className="panel composer-section-card composer-step-card">
      <div className="section-row">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>{t("basicInfoTitle")}</h2>
          <p className="muted">Keep this short for the demo. Title and description are enough to publish a private signal form.</p>
        </div>
      </div>

      <section className="contest-builder-quickstart contest-builder-quickstart-plain">
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
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder={t("builderDescriptionPlaceholder")}
          />
        </label>

        <section className="composer-deadline-card">
          <div className="section-row">
            <div>
              <span>回答期限</span>
              <p className="muted">期限後は新しい回答を送信できません</p>
              <p className="muted">管理者は期限後も回答済みデータを確認できます</p>
            </div>
          </div>

          <div className="composer-deadline-options" role="radiogroup" aria-label="回答期限">
            {deadlineOptions.map((option) => (
              <label key={option.value} className="composer-deadline-option">
                <input
                  type="radio"
                  name="responseDeadlinePreset"
                  value={option.value}
                  checked={responseDeadlinePreset === option.value}
                  onChange={() => {
                    setResponseDeadlinePreset(option.value);
                    if (option.value === "custom" && !responseDeadlineCustomAt) {
                      setResponseDeadlineCustomAt(toDateTimeLocalValue(Date.now() + 60 * 60 * 1000));
                    }
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          {responseDeadlinePreset === "custom" ? (
            <label>
              <span>期限日時</span>
              <input
                type="datetime-local"
                value={responseDeadlineCustomAt}
                min={toDateTimeLocalValue(Date.now() + 60 * 1000)}
                onChange={(event) => setResponseDeadlineCustomAt(event.target.value)}
              />
            </label>
          ) : null}
        </section>
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
