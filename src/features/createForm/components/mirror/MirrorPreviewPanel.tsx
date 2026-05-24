import { useI18n } from "../../../../i18n";
import { MirrorCurrentSignalNode } from "./MirrorCurrentSignalNode";
import { MirrorMetadataBadges } from "./MirrorMetadataBadges";
import { MirrorObjectCard } from "./MirrorObjectCard";
import { MirrorPublishedSignalCard } from "./MirrorPublishedSignalCard";
import { MirrorPublishReadiness } from "./MirrorPublishReadiness";
import { MirrorPublishTimeline } from "./MirrorPublishTimeline";
import { MirrorSignalIntelligence } from "./MirrorSignalIntelligence";
import { MirrorSignalMetadata } from "./MirrorSignalMetadata";
import { MirrorSignalObjectStatus } from "./MirrorSignalObjectStatus";
import { useMirrorPreviewModel } from "./hooks/useMirrorPreviewModel";
import type { MirrorPreviewPanelProps } from "./types";

export function MirrorPreviewPanel(props: MirrorPreviewPanelProps) {
  const { t } = useI18n();
  const { state, runtime, timelineSteps, intelligence } = useMirrorPreviewModel(props);
  const surface = props.surface ?? "builder";

  return (
    <aside className="panel glow-panel mirror-preview-panel mirror-theme-surface" data-surface={surface} aria-label={t("mirrorPanelAria")}>
      <div className="mirror-panel-header">
        <div>
          <p className="eyebrow">{t("mirrorPanelTitle")}</p>
          <h2>{state.title}</h2>
        </div>
        <span className="mirror-preview-only-pill">
          {state.publishedStatus === "published" ? t("mirrorStatusPublished") : t("mirrorPreviewOnly")}
        </span>
      </div>

      <p className="mirror-description">{state.description}</p>

      <MirrorObjectCard state={state} runtime={runtime} />
      <MirrorCurrentSignalNode state={state} />
      <MirrorSignalObjectStatus state={state} runtime={runtime} timelineSteps={timelineSteps} />

      <div className="mirror-desktop-detail-stack">
        <MirrorPublishReadiness state={state} analysis={intelligence} />
        <MirrorSignalIntelligence analysis={intelligence} isPrivate={state.isPrivate} />
        <MirrorSignalMetadata state={state} runtime={runtime} />
        <MirrorPublishTimeline steps={timelineSteps} />
        <MirrorMetadataBadges state={state} />
        <MirrorPublishedSignalCard runtime={runtime} />
      </div>

      <div className="mirror-mobile-detail-stack">
        <MirrorPublishReadiness state={state} analysis={intelligence} />
        <details className="mirror-mobile-detail">
          <summary>{t("mirrorSignalIntelligenceTitle")}</summary>
          <MirrorSignalIntelligence analysis={intelligence} isPrivate={state.isPrivate} />
        </details>
        <details className="mirror-mobile-detail">
          <summary>{t("mirrorSignalDetails")}</summary>
          <MirrorSignalMetadata state={state} runtime={runtime} />
          <MirrorMetadataBadges state={state} />
        </details>
        <details className="mirror-mobile-detail">
          <summary>{t("mirrorPublishReadiness")}</summary>
          <MirrorPublishTimeline steps={timelineSteps} />
          <MirrorPublishedSignalCard runtime={runtime} />
        </details>
      </div>
    </aside>
  );
}
