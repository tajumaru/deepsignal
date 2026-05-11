import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { RichTextContent } from "../../../components/RichText";
import { publishPhases } from "../constants";
import type { PublishOverlayState } from "../types";

interface PublishOverlayProps {
  open: boolean;
  overlay: PublishOverlayState;
  saving: boolean;
  title: string;
  description: string;
  fieldsCount: number;
  encryptSubmissions: boolean;
  purpose?: string;
  publicPath: string;
  isCrossDeviceShareReady: boolean;
  onCopyBlobId: () => Promise<void>;
  onClose: () => void;
}

export function PublishOverlay({
  open,
  overlay,
  saving,
  title,
  description,
  fieldsCount,
  encryptSubmissions,
  purpose,
  publicPath,
  isCrossDeviceShareReady,
  onCopyBlobId,
  onClose,
}: PublishOverlayProps) {
  const [qrMarkup, setQrMarkup] = useState("");
  const isBeaconVisible = overlay.stageIndex >= publishPhases.length - 1 && isCrossDeviceShareReady;

  const absolutePublicUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return publicPath;
    }
    return `${window.location.origin}${publicPath}`;
  }, [publicPath]);

  useEffect(() => {
    if (!open || !isCrossDeviceShareReady || !publicPath) {
      setQrMarkup("");
      return;
    }

    let cancelled = false;
    void QRCode.toString(absolutePublicUrl, {
      type: "svg",
      margin: 1,
      width: 256,
      color: {
        dark: "#04131e",
        light: "#ffffff",
      },
    }).then((svg: string) => {
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

        <div className={`publish-signal-shell stage-${publishPhases[overlay.stageIndex]?.key ?? "encoding"}`}>
          <div className="publish-signal-card">
            <span className="publish-signal-label">SIGNAL PAYLOAD</span>
            <strong>{title.trim() || "Untitled signal"}</strong>
            <RichTextContent value={description} className="rich-text-content" fallback="No intro recorded." />
            <div className="publish-signal-metrics">
              <span>{fieldsCount} nodes</span>
              <span>{encryptSubmissions ? "sealed" : "plain"}</span>
              <span>{purpose}</span>
            </div>
          </div>
        </div>

        <div className="publish-overlay-hero">
          <div className="publish-overlay-copy">
            <p className="eyebrow">Deep Transit</p>
            <h2 id="publish-overlay-title">Signal processing</h2>
            <p className="muted publish-overlay-intro">
              The payload is being reduced, submerged, and fixed into the Walrus observation layer.
            </p>
          </div>
          {isBeaconVisible ? (
            <div className="publish-beacon-panel publish-beacon-panel-top" aria-label="BEACON QR">
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
              <p className="publish-beacon-note muted">Scan to open the public responder flow on another device.</p>
            </div>
          ) : null}
        </div>

        <div className="publish-terminal panel">
          <div className="publish-terminal-header">
            <span>OBSERVATION // WALRUS UPLINK</span>
            <strong>{overlay.stageIndex >= publishPhases.length - 1 ? "PASSIVE WATCH" : "TRANSIT"}</strong>
          </div>
          <div className="publish-terminal-log" aria-live="polite">
            {publishPhases.map((phase, index) => {
              const state = index < overlay.stageIndex ? "done" : index === overlay.stageIndex ? "active" : "queued";
              return (
                <div key={phase.key} className={`publish-terminal-row is-${state}`}>
                  <span>{phase.label}</span>
                  <small>{state === "done" ? "complete" : state === "active" ? "in progress" : "queued"}</small>
                </div>
              );
            })}
          </div>
          <p className="publish-terminal-detail">
            {overlay.stageIndex >= publishPhases.length - 1 && overlay.resultNote
              ? overlay.resultNote
              : publishPhases[overlay.stageIndex]?.detail}
          </p>
        </div>

        <div className={`publish-blob-panel ${overlay.stageIndex >= 3 ? "is-visible" : ""}`}>
          <p className="eyebrow">Blob Address</p>
          <code className="publish-blob-id">{overlay.typedBlobId || "BLOB://........"}</code>
          <div className="publish-blob-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => void onCopyBlobId()}
              disabled={overlay.stageIndex < 3 || !overlay.blobId}
            >
              {overlay.blobCopied ? "Copied" : "Copy Blob ID"}
            </button>
            <span className="publish-storage-note">
              {overlay.storageMode === "walrus"
                ? "Immutable Walrus blob confirmed."
                : "Stored locally. Walrus relay unavailable."}
            </span>
          </div>
        </div>

        <div className={`publish-active-panel ${overlay.stageIndex >= publishPhases.length - 1 ? "is-visible" : ""}`}>
          <div className="publish-active-layout">
            <div>
              <p className="eyebrow">Observation State</p>
              <h3>SIGNAL ACTIVE</h3>
              <p className="muted">
                {overlay.resultNote || "The signal is now available for monitoring, routing, and review."}
              </p>
            </div>
          </div>
          <div className="publish-active-actions">
            <button type="button" className="primary-button" onClick={onClose}>
              DONE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
