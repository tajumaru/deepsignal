import { useI18n } from "../i18n";
import { getBlobViewerUrl } from "../storage/blobViewer";

interface BlobLinkProps {
  blobId?: string;
  label?: string;
}

export function BlobLink({ blobId, label }: BlobLinkProps) {
  const { t } = useI18n();
  const url = getBlobViewerUrl(blobId);

  if (!url) {
    return null;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer">
      {label ?? t("openBlob")}
    </a>
  );
}
