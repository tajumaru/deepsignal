import { PublicSignalMetaChip } from "../../../components/PublicSignalMeta";
import { useI18n } from "../../../i18n";
import type { PublicFormLoadErrorDetail } from "../hooks/usePublicFormLoader";

interface PublicFormLoadErrorDetailsProps {
  detail: PublicFormLoadErrorDetail;
  loadingBlobStatuses: boolean;
  onBlobStatusToggle: (open: boolean) => void | Promise<void>;
}

export function PublicFormLoadErrorDetails({
  detail,
  loadingBlobStatuses,
  onBlobStatusToggle,
}: PublicFormLoadErrorDetailsProps) {
  const { t } = useI18n();

  return (
    <div className="metadata-list">
      <div className="metadata-row">
        <span>{t("sharedLinkFailureReason")}</span>
        <strong>{detail.reason}</strong>
      </div>
      <div className="metadata-row">
        <span>{t("expectedFormId")}</span>
        <strong>{detail.expectedFormId}</strong>
      </div>
      {detail.actualFormId ? (
        <div className="metadata-row">
          <span>{t("actualFormId")}</span>
          <strong>{detail.actualFormId}</strong>
        </div>
      ) : null}
      {detail.manifestBlobId ? (
        <div className="metadata-row">
          <span>{t("manifestBlobId")}</span>
          <PublicSignalMetaChip type="manifest" value={detail.manifestBlobId} />
        </div>
      ) : null}
      {detail.formBlobId ? (
        <div className="metadata-row">
          <span>{t("formBlobId")}</span>
          <PublicSignalMetaChip type="blob" value={detail.formBlobId} />
        </div>
      ) : null}
      {detail.manifestBlobId || detail.formBlobId ? (
        <details
          className="answer-card answer-card-plain"
          onToggle={(event) => {
            void onBlobStatusToggle((event.currentTarget as HTMLDetailsElement).open);
          }}
        >
          <summary>{t("walrusBlobStatus")}</summary>
          {loadingBlobStatuses ? <p className="muted">{t("loadingPublicForm")}</p> : null}
          {detail.manifestStatus ? (
            <div className="metadata-row">
              <span>{t("walrusBlobStatus")}</span>
              <strong>{detail.manifestStatus}</strong>
            </div>
          ) : null}
          {detail.formBlobStatus ? (
            <div className="metadata-row">
              <span>{t("linkedBlobStatus")}</span>
              <strong>{detail.formBlobStatus}</strong>
            </div>
          ) : null}
        </details>
      ) : null}
      {detail.failedAssetPath ? (
        <>
          <div className="metadata-row">
            <span>{t("failedAsset")}</span>
            <strong>{detail.failedAssetPath}</strong>
          </div>
          <div className="metadata-row">
            <span>{t("assetStatus")}</span>
            <strong>
              {detail.failedAssetStatus ?? "unknown"}
              {detail.failedAssetContentType ? ` | ${detail.failedAssetContentType}` : ""}
            </strong>
          </div>
          <div className="metadata-row">
            <span>{t("assetProbeAttempts")}</span>
            <strong>{detail.failedAssetAttempts ?? 1}</strong>
          </div>
          {detail.failedAssetBuild ? (
            <div className="metadata-row">
              <span>{t("assetBuild")}</span>
              <strong>{detail.failedAssetBuild}</strong>
            </div>
          ) : null}
          {detail.failedAssetUrl ? (
            <div className="metadata-row">
              <span>{t("assetUrl")}</span>
              <strong>{detail.failedAssetUrl}</strong>
            </div>
          ) : null}
          {detail.failedAssetErrorMessage ? (
            <div className="metadata-row">
              <span>{t("assetNetworkError")}</span>
              <strong>{detail.failedAssetErrorMessage}</strong>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
