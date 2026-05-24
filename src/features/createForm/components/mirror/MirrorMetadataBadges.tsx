import { useI18n } from "../../../../i18n";
import type { MirrorPreviewState } from "./types";
import { createMetadataBadges } from "./utils";

export function MirrorMetadataBadges({ state }: { state: MirrorPreviewState }) {
  const { t } = useI18n();
  const badges = createMetadataBadges(state, t);

  return (
    <div className="mirror-metadata-badges" aria-label={t("mirrorMetadataBadgesAria")}>
      {badges.map((badge) => (
        <span key={badge.label} className={`mirror-metadata-badge is-${badge.tone ?? "default"}`}>
          {badge.label}
        </span>
      ))}
    </div>
  );
}
