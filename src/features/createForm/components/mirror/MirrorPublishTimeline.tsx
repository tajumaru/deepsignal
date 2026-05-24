import { useI18n } from "../../../../i18n";
import type { TimelineStep } from "./types";

export function MirrorPublishTimeline({ steps }: { steps: TimelineStep[] }) {
  const { t } = useI18n();

  return (
    <section className="mirror-publish-timeline" aria-label={t("mirrorTimelineTitle")}>
      <div>
        <p className="eyebrow">{t("mirrorTimelineTitle")}</p>
        <h3>{t("mirrorTimelineHeading")}</h3>
      </div>
      <div className="mirror-timeline-list">
        {steps.map((step, index) => (
          <span
            key={step.label}
            className={step.complete ? "is-complete" : step.active ? "is-active" : "is-pending"}
          >
            <i aria-hidden="true">{step.complete ? "OK" : index + 1}</i>
            <div className="mirror-timeline-copy">
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
            <em>{step.statusLabel}</em>
          </span>
        ))}
      </div>
    </section>
  );
}
