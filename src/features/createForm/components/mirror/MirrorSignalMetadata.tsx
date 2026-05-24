import { useI18n } from "../../../../i18n";
import type { MirrorPreviewState, MirrorRuntimeState } from "./types";
import { displayValue, formatBytesCompact, getSuiState, getWalrusState } from "./utils";

function toneClass(tone: "active" | "default" | "warning") {
  return tone === "active" ? "is-active" : tone === "warning" ? "is-warning" : "is-default";
}

export function MirrorSignalMetadata({ state, runtime }: { state: MirrorPreviewState; runtime: MirrorRuntimeState }) {
  const { t } = useI18n();
  const walrusState = getWalrusState(runtime, t);
  const suiState = getSuiState(runtime, t);
  const sealedLabel = state.isPrivate ? t("mirrorProtection") : t("mirrorResponsePrivacy");
  const rows = [
    [t("mirrorStatusLabel"), state.publishedStatus === "published" ? t("mirrorPublishedSignal") : t("mirrorPreviewOnly")],
    [t("mirrorStorageLabel"), runtime.savedForm?.blobId ? t("mirrorStoredSafely") : t("mirrorStorageLocalPreview")],
    [t("mirrorSignalShape"), t("mirrorSignalShapeValue", { count: state.fieldCount })],
    [t("visibility"), state.visibilityLabel],
    [sealedLabel, state.isPrivate ? t("mirrorSealedBeforeStorage") : t("mirrorOpenIntake")],
    [t("mirrorResponderAccess"), state.identityPolicyLabel],
    [t("mirrorRuntimeMode"), displayValue(runtime.storageRuntimeMode, t("notConfigured"))],
    [t("mirrorStorageMode"), runtime.walrusCostEstimate?.storageMode ?? runtime.storageRuntimeMode ?? "local"],
    [t("mirrorRuntimeNotice"), displayValue(runtime.storageRuntimeNotice, t("none"))],
    [t("mirrorBlobId"), displayValue(runtime.savedForm?.blobId, t("notCreatedYet"))],
    [t("mirrorManifestBlobId"), displayValue(runtime.savedForm?.manifestBlobId, t("notCreatedYet"))],
    [t("mirrorOnchainFormId"), displayValue(runtime.savedForm?.onchainFormId, t("notRegisteredYet"))],
    [t("mirrorSealState"), state.isPrivate ? t("mirrorSealEnabled") : t("mirrorOpenIntake")],
    [t("mirrorIdentityPolicy"), state.identityPolicyLabel],
    runtime.walrusCostEstimate
      ? [t("mirrorCostEstimate"), `${formatBytesCompact(runtime.walrusCostEstimate.payloadBytes)} ${runtime.walrusCostEstimate.status}`.trim()]
      : [t("mirrorCostEstimate"), t("notConfigured")],
    runtime.storageRuntimeDiagnostics
      ? [t("mirrorStorageDiagnostics"), runtime.storageRuntimeDiagnostics.lastRpcError || runtime.storageRuntimeDiagnostics.stage]
      : [t("mirrorStorageDiagnostics"), t("none")],
  ];

  return (
    <section className="mirror-metadata-shell" aria-label={t("mirrorMetadataSectionAria")}>
      <div>
        <p className="eyebrow">{t("mirrorMetadataSectionTitle")}</p>
        <h3>{t("mirrorMetadataSectionHeading")}</h3>
        <p className="muted">{t("mirrorMetadataSectionBody")}</p>
      </div>

      <div className="mirror-infra-grid">
        <article className={`mirror-infra-card ${toneClass(walrusState.tone)}`}>
          <div className="mirror-infra-card-header">
            <div>
              <small>{t("mirrorWalrusStorageState")}</small>
              <strong>{walrusState.label}</strong>
            </div>
            <span className={`mirror-infra-pill ${toneClass(walrusState.tone)}`}>{walrusState.label}</span>
          </div>
          <p className="mirror-infra-copy">{walrusState.body}</p>
          <div className="mirror-infra-badges">
            <span>{state.isPrivate ? t("mirrorBadgeSealed") : t("mirrorBadgeOpen")}</span>
            <span>{runtime.savedForm?.manifestBlobId ? t("mirrorBadgeRecoverable") : t("mirrorBadgeManifestPending")}</span>
            <span>{runtime.savedForm?.blobId ? t("mirrorBadgeImmutable") : t("mirrorBadgePreviewPath")}</span>
          </div>
        </article>

        <article className={`mirror-infra-card ${toneClass(suiState.tone)}`}>
          <div className="mirror-infra-card-header">
            <div>
              <small>{t("mirrorSuiRegistrationState")}</small>
              <strong>{suiState.label}</strong>
            </div>
            <span className={`mirror-infra-pill ${toneClass(suiState.tone)}`}>{suiState.label}</span>
          </div>
          <p className="mirror-infra-copy">{suiState.body}</p>
          <div className="mirror-infra-badges">
            <span>{runtime.savedForm?.onchainFormId ? t("mirrorBadgeVerified") : t("mirrorBadgeAwaitingChain")}</span>
            <span>{runtime.publicUrl || runtime.publicPath ? t("mirrorBadgeRouteLive") : t("mirrorBadgeRoutePending")}</span>
            <span>{state.identityPolicyLabel}</span>
          </div>
        </article>
      </div>

      <div className="mirror-signal-metadata">
        {rows.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}
