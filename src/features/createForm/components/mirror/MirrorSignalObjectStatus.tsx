import { useI18n } from "../../../../i18n";
import type { MirrorPreviewState, MirrorRuntimeState, TimelineStep } from "./types";
import { getSignalObjectStatus, getStatusCopy } from "./utils";

export function MirrorSignalObjectStatus({
  state,
  runtime,
  timelineSteps,
}: {
  state: MirrorPreviewState;
  runtime: MirrorRuntimeState;
  timelineSteps: TimelineStep[];
}) {
  const { t } = useI18n();
  const status = getSignalObjectStatus(state, runtime);
  const statusCopy = getStatusCopy(status, t);
  const completedCount = timelineSteps.filter((step) => step.complete).length;
  const progress = Math.max(8, Math.round((completedCount / timelineSteps.length) * 100));
  const failureMessage = runtime.publishFailure?.message || runtime.publishError?.trim();

  return (
    <section className={`mirror-object-status-card is-${status}`} aria-label={t("mirrorSignalObjectStatus")}>
      <div className="mirror-object-status-header">
        <div>
          <p className="eyebrow">{t("mirrorSignalObjectStatus")}</p>
          <h3>{statusCopy.label}</h3>
        </div>
        <span className={`mirror-object-status-pill is-${status}`}>{statusCopy.label}</span>
      </div>
      <p className="muted">{failureMessage || statusCopy.body}</p>
      <div className="mirror-object-status-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <small className="mirror-object-status-fallback">
        {runtime.savedForm ? t("mirrorStatusPublishedFallback") : t("mirrorStatusDraftFallback")}
      </small>
    </section>
  );
}
