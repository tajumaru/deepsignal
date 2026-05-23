import { SignalMetaChip } from "../../../components/SignalMetaChip";
import { StorageProof } from "../../../components/StorageProof";
import { getAttachmentDownloadHref, type AttachmentPreviewState } from "../../../hooks/useAttachmentPreviews";
import { useI18n } from "../../../i18n";
import { isLocalFallbackBlob } from "../../../lib/signalInbox";
import type { Submission } from "../../../types";

interface SignalAttachmentListProps {
  attachments: Submission["attachments"];
  attachmentPreviews: Record<string, AttachmentPreviewState>;
}

export function SignalAttachmentList({
  attachments,
  attachmentPreviews,
}: SignalAttachmentListProps) {
  const { t } = useI18n();
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
            <div className="attachment-content">
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
            <div className="attachment-actions signal-meta-row-value">
              {attachment.storage === "inline" ? (
                <strong>{t("embeddedInPrivateSignal")}</strong>
              ) : (
                <SignalMetaChip type="blob" value={attachment.blobId} />
              )}
              {attachment.storage !== "inline" && !isLocalFallbackBlob(attachment.blobId) ? (
                <StorageProof
                  blobId={attachment.blobId}
                  proof={attachment.walrusProof}
                  fallbackSize={attachment.size}
                  compact
                />
              ) : null}
              {downloadHref ? (
                <a
                  className="ghost-button"
                  href={downloadHref}
                  download={label}
                >
                  {t("downloadAttachment")}
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
