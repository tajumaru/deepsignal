import { useI18n } from "../../../../i18n";
import type { MirrorPreviewState, MirrorRuntimeState } from "./types";
import { getSuiState, getWalrusState } from "./utils";

export function MirrorObjectCard({ state, runtime }: { state: MirrorPreviewState; runtime: MirrorRuntimeState }) {
  const { t } = useI18n();
  const walrusState = getWalrusState(runtime, t);
  const suiState = getSuiState(runtime, t);

  return (
    <section className="mirror-object-card-v2" aria-label={t("mirrorSignalObjectPreview")}>
      <div className="mirror-object-ambient" aria-hidden="true" />
      <div className="mirror-object-core" aria-hidden="true">
        <span className="mirror-object-core-eye mirror-object-core-eye-left" />
        <span className="mirror-object-core-eye mirror-object-core-eye-right" />
        <span className="mirror-object-core-tusk mirror-object-core-tusk-left" />
        <span className="mirror-object-core-tusk mirror-object-core-tusk-right" />
      </div>
      <div className="mirror-object-copy">
        <span className="mirror-object-kicker">{t("mirrorObjectCardKicker")}</span>
        <strong>{state.title}</strong>
        <small>{t("mirrorObjectCardBlockCount", { count: state.fieldCount })}</small>
      </div>
      <div className="mirror-object-ledger">
        <span>{t("mirrorObjectCardState")}</span>
        <strong>{walrusState.label}</strong>
        <small>{suiState.label}</small>
      </div>
    </section>
  );
}
