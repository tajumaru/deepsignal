import { useI18n } from "../../../../i18n";
import type { MirrorRuntimeState } from "./types";
import { displayValue } from "./utils";

export function MirrorPublishedSignalCard({ runtime }: { runtime: MirrorRuntimeState }) {
  const { t } = useI18n();
  const savedForm = runtime.savedForm;
  if (!savedForm) {
    return null;
  }

  const signalLink = runtime.publicUrl || runtime.publicPath || "";
  const rows = [
    [t("mirrorPublicLink"), displayValue(signalLink, t("notCreatedYet"))],
    [t("mirrorFormId"), displayValue(savedForm.id, t("notCreatedYet"))],
    [t("mirrorBlobId"), displayValue(savedForm.blobId, t("notCreatedYet"))],
    [t("mirrorManifestBlobId"), displayValue(savedForm.manifestBlobId, t("notCreatedYet"))],
    [t("mirrorOnchainFormId"), displayValue(savedForm.onchainFormId, t("notRegisteredYet"))],
  ];

  return (
    <section className="mirror-published-card" aria-label={t("mirrorPublishedSignal")}>
      <div className="mirror-published-card-header">
        <div>
          <p className="eyebrow">{t("mirrorPublishedSignal")}</p>
          <h3>{savedForm.title || t("untitledForm")}</h3>
        </div>
        {signalLink ? (
          <a className="ghost-button mirror-open-signal-link" href={signalLink} target="_blank" rel="noreferrer">
            {t("mirrorOpenSignal")}
          </a>
        ) : null}
      </div>
      <p className="muted">{t("mirrorPublishedSignalBody")}</p>
      <div className="mirror-published-grid">
        {rows.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      {signalLink && runtime.onCopyLink ? (
        <button type="button" className="secondary-button mirror-copy-link-button" onClick={() => void runtime.onCopyLink?.()}>
          {t("mirrorCopyLink")}
        </button>
      ) : null}
    </section>
  );
}
