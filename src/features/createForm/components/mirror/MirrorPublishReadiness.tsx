import { useI18n } from "../../../../i18n";
import type { SignalDraftAnalysis } from "../../signalIntelligence";
import type { MirrorPreviewState } from "./types";
import { getPrimaryReadinessAction, getReadinessChecks } from "./utils";

export function MirrorPublishReadiness({
  state,
  analysis,
}: {
  state: MirrorPreviewState;
  analysis: SignalDraftAnalysis;
}) {
  const { t } = useI18n();
  const checks = getReadinessChecks(state, analysis, t);
  const nextAction = getPrimaryReadinessAction(state, analysis, t);

  return (
    <section className="mirror-readiness-card" aria-label={t("mirrorPublishReadiness")}>
      <div>
        <p className="eyebrow">{t("mirrorPublishReadiness")}</p>
        <h3>{state.isReadyToPublish ? t("mirrorReadinessReadyTitle") : t("mirrorReadinessReviewTitle")}</h3>
        <p className="muted">
          {state.publishedStatus === "published" ? t("mirrorReadinessPublishedBody") : t("mirrorReadinessDraftBody")}
        </p>
      </div>
      <article className="mirror-readiness-focus">
        <small>{t("mirrorReadinessNextAction")}</small>
        <strong>{nextAction}</strong>
      </article>
      <div className="mirror-readiness-list">
        {checks.map(([label, ready]) => (
          <span key={label} className={ready ? "is-ready" : "is-pending"}>
            <i aria-hidden="true">{ready ? "OK" : "..."}</i>
            <strong>{label}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}
