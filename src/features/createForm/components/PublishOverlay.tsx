import { Link } from "react-router-dom";
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
  savedFormId?: string;
  publicPath: string;
  isCrossDeviceShareReady: boolean;
  onCopyBlobId: () => Promise<void>;
  onCopyLink: () => Promise<void>;
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
  savedFormId,
  publicPath,
  isCrossDeviceShareReady,
  onCopyBlobId,
  onCopyLink,
  onClose,
}: PublishOverlayProps) {
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
            <p>{description.trim() || "No intro recorded."}</p>
            <div className="publish-signal-metrics">
              <span>{fieldsCount} nodes</span>
              <span>{encryptSubmissions ? "sealed" : "plain"}</span>
              <span>{purpose}</span>
            </div>
          </div>
        </div>

        <div className="publish-overlay-copy">
          <p className="eyebrow">Deep Transit</p>
          <h2 id="publish-overlay-title">Signal processing</h2>
          <p className="muted publish-overlay-intro">
            The payload is being reduced, submerged, and fixed into the Walrus observation layer.
          </p>
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
          <div>
            <p className="eyebrow">Observation State</p>
            <h3>SIGNAL ACTIVE</h3>
            <p className="muted">
              {overlay.resultNote || "The signal is now available for monitoring, routing, and review."}
            </p>
          </div>
          <div className="publish-active-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void onCopyLink()}
              disabled={!isCrossDeviceShareReady}
            >
              {overlay.linkCopied ? "Copied Link" : "Copy Link"}
            </button>
            {savedFormId ? (
              <>
                <Link className="ghost-button" to={`/dashboard/forms/${savedFormId}`}>
                  Open Dashboard
                </Link>
                <Link className="ghost-button" to={publicPath}>
                  View Signals
                </Link>
              </>
            ) : null}
            <button type="button" className="ghost-button" onClick={onClose}>
              Close Monitor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
