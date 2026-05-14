import { lazy, Suspense } from "react";
import { toDateTimeLocalValue } from "../../../lib/responseDeadline";
import type { ResponseDeadlinePreset, Translate } from "../types";

const RichTextEditor = lazy(() =>
  import("../../../components/RichTextEditor").then((module) => ({
    default: module.RichTextEditor,
  })),
);

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
    { value: "none", label: t("responseDeadlineNone") },
    { value: "1h", label: t("responseDeadlineOneHour") },
    { value: "24h", label: t("responseDeadlineTwentyFourHours") },
    { value: "7d", label: t("responseDeadlineSevenDays") },
    { value: "30d", label: t("responseDeadlineThirtyDays") },
    { value: "custom", label: t("responseDeadlineCustom") },
  ];

  return (
    <section className="panel composer-section-card composer-step-card">
      <div className="section-row">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>{t("basicInfoTitle")}</h2>
          <p className="muted">{t("infoStepBody")}</p>
        </div>
      </div>

      <section className="contest-builder-quickstart contest-builder-quickstart-plain">
        <div className="section-row">
          <div>
            <p className="eyebrow">{t("contestDefaultsEyebrow")}</p>
            <h3>{t("privateSignalReady")}</h3>
          </div>
          <span className="signal-chip signal-chip-accent">{t("encryptSubmissionsOn")}</span>
        </div>
        <p className="muted">{t("contestDefaultsBody")}</p>
      </section>

      <div className="composer-info-grid">
        <label>
          <span>{t("formTitle")}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className="composer-info-intro">
          <span>{t("description")}</span>
          <Suspense
            fallback={
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("builderDescriptionPlaceholder")}
                rows={6}
              />
            }
          >
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder={t("builderDescriptionPlaceholder")}
            />
          </Suspense>
        </label>

        <section className="composer-deadline-card">
          <div className="section-row">
            <div>
              <span>{t("responseDeadlineTitle")}</span>
              <p className="muted">{t("responseDeadlineHelp")}</p>
              <p className="muted">{t("responseDeadlineAdminHelp")}</p>
            </div>
          </div>

          <div className="composer-deadline-options" role="radiogroup" aria-label={t("responseDeadlineTitle")}>
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
              <span>{t("responseDeadlineCustomAt")}</span>
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
