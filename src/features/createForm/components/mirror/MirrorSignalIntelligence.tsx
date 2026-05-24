import { useI18n } from "../../../../i18n";
import type { SignalDraftAnalysis } from "../../signalIntelligence";
import { getBiggestFriction, getIntelligenceMessage, getPrivacyPostureLabel, getResponseFatigueLabel, getScoreLabel, getTopRecommendation } from "./utils";

function MirrorIntelligenceList({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: SignalDraftAnalysis["suggestions"];
}) {
  const { t } = useI18n();

  return (
    <div className="mirror-intelligence-list">
      <strong>{title}</strong>
      {items.length > 0 ? (
        items.map((item) => (
          <span key={item.id} className={`is-${item.tone}`}>
            <i aria-hidden="true" />
            <small>{getIntelligenceMessage(item, t)}</small>
          </span>
        ))
      ) : (
        <span className="is-empty">
          <i aria-hidden="true" />
          <small>{emptyLabel}</small>
        </span>
      )}
    </div>
  );
}

export function MirrorSignalIntelligence({
  analysis,
  isPrivate,
}: {
  analysis: SignalDraftAnalysis;
  isPrivate: boolean;
}) {
  const { t } = useI18n();
  const scoreLabel = getScoreLabel(analysis.score, t);
  const privacyPosture = getPrivacyPostureLabel(isPrivate, analysis, t);

  return (
    <section className="mirror-intelligence-card" aria-label={t("mirrorSignalIntelligenceTitle")}>
      <div className="mirror-intelligence-header">
        <div>
          <p className="eyebrow">{t("mirrorSignalIntelligenceTitle")}</p>
          <h3>{t("mirrorSignalIntelligenceHeading")}</h3>
        </div>
        <span className="mirror-intelligence-score">
          <small>{t("mirrorSignalIntelligenceScore")}</small>
          <strong>{analysis.score}</strong>
          <em>{scoreLabel}</em>
        </span>
      </div>
      <p className="muted">{t("mirrorSignalIntelligenceBody")}</p>

      <div className="mirror-intelligence-priority-grid">
        <article className="mirror-intelligence-priority-card">
          <small>{t("mirrorIntelligenceTopRecommendation")}</small>
          <strong>{getTopRecommendation(analysis, t)}</strong>
        </article>
        <article className="mirror-intelligence-priority-card">
          <small>{t("mirrorIntelligenceBiggestFriction")}</small>
          <strong>{getBiggestFriction(analysis, t)}</strong>
        </article>
        <article className="mirror-intelligence-priority-card">
          <small>{t("mirrorIntelligenceResponseFatigue")}</small>
          <strong>{getResponseFatigueLabel(analysis, t)}</strong>
        </article>
        <article className="mirror-intelligence-priority-card">
          <small>{t("mirrorIntelligencePrivacyPosture")}</small>
          <strong>{privacyPosture}</strong>
        </article>
      </div>

      <div className="mirror-intelligence-grid">
        <MirrorIntelligenceList
          title={t("mirrorSignalSuggestions")}
          emptyLabel={t("mirrorSignalNoSuggestions")}
          items={analysis.suggestions}
        />
        <MirrorIntelligenceList
          title={t("mirrorSignalWarnings")}
          emptyLabel={t("mirrorSignalNoWarnings")}
          items={analysis.warnings}
        />
        <MirrorIntelligenceList
          title={t("mirrorSignalStrengths")}
          emptyLabel={t("mirrorSignalNoStrengths")}
          items={analysis.strengths}
        />
      </div>
    </section>
  );
}
