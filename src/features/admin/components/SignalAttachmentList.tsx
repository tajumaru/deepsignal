import { BlobLink } from "../../../components/BlobLink";
import { SignalMetaChip } from "../../../components/SignalMetaChip";
import { getAttachmentDownloadHref, type AttachmentPreviewState } from "../../../hooks/useAttachmentPreviews";
import { isLocalFallbackBlob } from "../../../lib/signalInbox";
import type { Submission } from "../../../types";

interface SignalAttachmentListProps {
  attachments: Submission["attachments"];
  attachmentPreviews: Record<string, AttachmentPreviewState>;
  verifyOnWalrusLabel: string;
}

export function SignalAttachmentList({
  attachments,
  attachmentPreviews,
  verifyOnWalrusLabel,
}: SignalAttachmentListProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="stack">
      {attachments.map((attachment) => {
        const preview = attachmentPreviews[attachment.blobId];
        const label = preview?.name ?? attachment.originalName ?? attachment.name;
        const downloadHref = getAttachmentDownloadHref(attachment, preview);
        return (
          <div key={attachment.blobId} className="attachment-row">
            <div>
              <strong>{label}</strong>
              <p className="muted">
                {attachment.type} · {Math.round(attachment.size / 1024)} KB
              </p>
              {attachment.encrypted && preview?.error ? (
                <p className="warning-text">{preview.error}</p>
              ) : null}
              {preview?.kind === "image" && preview.url ? (
                <img
                  src={preview.url}
                  alt={label}
                  className="attachment-preview-image"
                />
              ) : null}
              {preview?.kind === "video" && preview.url ? (
                <video
                  src={preview.url}
                  className="attachment-preview-video"
                  controls
                />
              ) : null}
            </div>
            <div className="stack signal-meta-row-value">
              {attachment.storage === "inline" ? (
                <strong>Embedded in private signal</strong>
              ) : (
                <SignalMetaChip type="blob" value={attachment.blobId} />
              )}
              {attachment.storage !== "inline" && !isLocalFallbackBlob(attachment.blobId) ? (
                <BlobLink
                  blobId={attachment.blobId}
                  label={verifyOnWalrusLabel}
                />
              ) : null}
              {downloadHref ? (
                <a
                  className="ghost-button"
                  href={downloadHref}
                  download={label}
                >
                  Download attachment
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
