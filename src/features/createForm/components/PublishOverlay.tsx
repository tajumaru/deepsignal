import { useEffect, useMemo, useState } from "react";
import { RichTextContent } from "../../../components/RichText";
import { formatSignalMetaValue } from "../../../components/SignalMetaChip";
import { publishPhases } from "../constants";
import type { PublishOverlayState, Translate } from "../types";

interface PublishOverlayProps {
  t: Translate;
  open: boolean;
  overlay: PublishOverlayState;
  saving: boolean;
  title: string;
  description: string;
  fieldsCount: number;
  encryptSubmissions: boolean;
  purpose?: string;
  publicPath: string;
  publicUrl: string;
  isCrossDeviceShareReady: boolean;
  onCopyLink: () => Promise<void>;
  onCopyBlobId: () => Promise<void>;
  onClose: () => void;
}

export function PublishOverlay({
  t,
  open,
  overlay,
  saving,
  title,
  description,
  fieldsCount,
  encryptSubmissions,
  purpose,
  publicPath,
  publicUrl,
  isCrossDeviceShareReady,
  onCopyLink,
  onCopyBlobId,
  onClose,
}: PublishOverlayProps) {
  void onCopyLink;
  const [qrMarkup, setQrMarkup] = useState("");
  const isBeaconVisible = overlay.stageIndex >= publishPhases.length - 1 && isCrossDeviceShareReady;
  const activePhase = publishPhases[overlay.stageIndex];
  const phaseMessages = {
    encoding: { label: t("publishPhaseEncodingLabel"), detail: t("publishPhaseEncodingDetail") },
    encrypting: { label: t("publishPhaseEncryptingLabel"), detail: t("publishPhaseEncryptingDetail") },
    sending: { label: t("publishPhaseSendingLabel"), detail: t("publishPhaseSendingDetail") },
    stored: { label: t("publishPhaseStoredLabel"), detail: t("publishPhaseStoredDetail") },
    registering: { label: t("publishPhaseRegisteringLabel"), detail: t("publishPhaseRegisteringDetail") },
    active: { label: t("publishPhaseActiveLabel"), detail: t("publishPhaseActiveDetail") },
  };

  const absolutePublicUrl = useMemo(() => publicUrl, [publicUrl]);
  const typedBlobValue = overlay.typedBlobId.startsWith("BLOB://")
    ? overlay.typedBlobId.slice("BLOB://".length)
    : overlay.typedBlobId;
  const displayedBlobId = overlay.blobId
    ? formatSignalMetaValue("blob", typedBlobValue || overlay.blobId)
    : t("blobPlaceholder");

  useEffect(() => {
    if (!open || !isCrossDeviceShareReady || !publicPath) {
      setQrMarkup("");
      return;
    }

    let cancelled = false;
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toString(absolutePublicUrl, {
          type: "svg",
          margin: 1,
          width: 256,
          color: {
            dark: "#04131e",
            light: "#ffffff",
          },
        }),
      )
      .then((svg: string) => {
        if (!cancelled) {
          setQrMarkup(svg);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [absolutePublicUrl, isCrossDeviceShareReady, open, publicPath]);

  if (!open) {
    return null;
  }

  return (
    <div className="publish-overlay" role="dialog" aria-modal="true" aria-labelledby="publish-overlay-title">
      <div className="publish-overlay-backdrop" onClick={() => (saving ? undefined : onClose())} />
      <div className="publish-overlay-panel">
        <div className="publish-overlay-noise" aria-hidden="true" />
        <div className="publish-overlay-scanlines" aria-hidden="true" />
        <div className="publish-overlay-particles" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, index) => (
            <span key={index} className={`publish-particle publish-particle-${(index % 4) + 1}`} />
          ))}
        </div>
        <div className="publish-overlay-rings" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className={`publish-signal-shell stage-${activePhase?.key ?? "encoding"}`}>
          <div className="publish-signal-card">
            <span className="publish-signal-label">{t("publishOverlayPayloadLabel")}</span>
            <strong>{title.trim() || t("publishOverlayUntitledSignal")}</strong>
            <RichTextContent value={description} className="rich-text-content" fallback={t("publishOverlayNoIntro")} />
            <div className="publish-signal-metrics">
              <span>{t("publishOverlayNodes", { count: fieldsCount })}</span>
              <span>{encryptSubmissions ? t("publishOverlaySealed") : t("publishOverlayPlain")}</span>
              <span>{purpose}</span>
            </div>
          </div>
        </div>

        <div className="publish-overlay-hero">
          <div className="publish-overlay-copy">
            <p className="eyebrow">{t("publishOverlayEyebrow")}</p>
            <h2 id="publish-overlay-title">{t("publishOverlayTitle")}</h2>
            <p className="muted publish-overlay-intro">
              {t("publishOverlayIntro")}
            </p>
          </div>
          {isBeaconVisible ? (
            <div className="publish-beacon-panel publish-beacon-panel-top" aria-label={t("publishBeaconAria")}>
              <p className="eyebrow">BEACON</p>
              <div className="beacon-qr-shell publish-beacon-qr-shell">
                {qrMarkup ? (
                  <div
                    className="beacon-qr-markup publish-beacon-qr-markup"
                    dangerouslySetInnerHTML={{ __html: qrMarkup }}
                  />
                ) : (
                  <div className="beacon-qr-placeholder" aria-hidden="true" />
                )}
              </div>
              <p className="publish-beacon-note muted">{t("publishBeaconNote")}</p>
            </div>
          ) : null}
        </div>

        <div className="publish-terminal panel">
          <div className="publish-terminal-header">
            <span>{t("publishTerminalHeader")}</span>
            <strong>{overlay.stageIndex >= publishPhases.length - 1 ? t("publishTerminalPassiveWatch") : t("publishTerminalTransit")}</strong>
          </div>
          <div className="publish-terminal-log" aria-live="polite">
            {publishPhases.map((phase, index) => {
              const state = index < overlay.stageIndex ? "done" : index === overlay.stageIndex ? "active" : "queued";
              const statusText =
                state === "active" && overlay.activeStageStatus
                  ? overlay.activeStageStatus
                  : state === "done"
                    ? t("publishStatusComplete")
                    : state === "active"
                      ? t("publishStatusInProgress")
                      : t("publishStatusQueued");
              const phaseMessage = phaseMessages[phase.key];
              return (
                <div key={phase.key} className={`publish-terminal-row is-${state}`}>
                  <span>{phaseMessage.label}</span>
                  <small>{statusText}</small>
                </div>
              );
            })}
          </div>
          <p className="publish-terminal-detail">
            {overlay.stageIndex >= publishPhases.length - 1 && overlay.resultNote
              ? overlay.resultNote
              : overlay.activeStageDetail || (activePhase ? phaseMessages[activePhase.key].detail : "")}
          </p>
        </div>

        <div className="publish-status-grid">
          <div className={`publish-blob-panel ${overlay.stageIndex >= 3 ? "is-visible" : ""}`}>
            <p className="eyebrow">{t("blobAddress")}</p>
            <button
              type="button"
              className="publish-blob-id"
              onClick={() => void onCopyBlobId()}
              disabled={overlay.stageIndex < 3 || !overlay.blobId}
              title={overlay.blobId}
              aria-label={overlay.blobCopied ? t("copied") : t("copyBlobId")}
            >
              <code>{displayedBlobId}</code>
              <span>{overlay.blobCopied ? t("copied") : t("copyBlobId")}</span>
            </button>
            <div className="publish-blob-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => void onCopyBlobId()}
                disabled={overlay.stageIndex < 3 || !overlay.blobId}
              >
                {overlay.blobCopied ? t("copied") : t("copyBlobId")}
              </button>
              <span className="publish-storage-note">
                {overlay.storageMode === "walrus"
                  ? t("immutableWalrusBlobConfirmed")
                  : t("storedLocallyWalrusUnavailable")}
              </span>
            </div>
          </div>

          <div className={`publish-active-panel ${overlay.stageIndex >= publishPhases.length - 1 ? "is-visible" : ""}`}>
            <div className="publish-active-layout">
              <div>
                <p className="eyebrow">{t("observationState")}</p>
                <h3>{t("signalActiveTitle")}</h3>
                <p className="muted">
                  {overlay.resultNote || t("signalAvailableForReview")}
                </p>
              </div>
            </div>
            <div className="publish-active-actions">
              <button type="button" className="primary-button" onClick={onClose}>
                {t("publishOverlayDone")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
