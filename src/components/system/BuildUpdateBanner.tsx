import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import {
  subscribeToBuildUpdateNotices,
  updateDeepSignalToLatest,
  type BuildUpdateNotice,
} from "../../lib/buildUpdate";

export function BuildUpdateBanner() {
  const { t } = useI18n();
  const [notice, setNotice] = useState<BuildUpdateNotice | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => subscribeToBuildUpdateNotices(setNotice), []);

  if (!notice) {
    return null;
  }

  async function handleUpdate() {
    if (!notice) {
      return;
    }
    setUpdating(true);
    setUpdateError(null);
    try {
      await updateDeepSignalToLatest(notice);
    } catch (error) {
      setUpdating(false);
      setUpdateError(error instanceof Error ? error.message : "DeepSignal update is not ready yet. Try again in a moment.");
      console.warn("[DeepSignal update] update action failed", error);
    }
  }

  return (
    <aside className="build-update-banner" role="status" aria-live="polite">
      <div className="build-update-copy">
        <strong>
          {notice.reason === "chunk_load_failure"
            ? t("buildUpdateChunkFailureTitle")
            : t("buildUpdateAvailableTitle")}
        </strong>
        <p>{t("buildUpdateBody")}</p>
        {updateError ? <p className="build-update-error">{updateError}</p> : null}
        {notice.chunkFailure ? (
          <details className="build-update-details">
            <summary>{t("buildUpdateDiagnostics")}</summary>
            <dl className="build-update-diagnostics" aria-label={t("buildUpdateDiagnostics")}>
              <dt>{t("buildUpdateFailedChunk")}</dt>
              <dd>{notice.chunkFailure.chunkUrl ?? "unknown"}</dd>
              <dt>{t("buildUpdateCurrentBuild")}</dt>
              <dd>
                v{notice.chunkFailure.buildVersion} build {notice.chunkFailure.buildTime} {notice.chunkFailure.gitHash}
              </dd>
              <dt>{t("buildUpdateRetry")}</dt>
              <dd>
                {notice.chunkFailure.retryCount}/{notice.chunkFailure.retryLimit}
              </dd>
              <dt>{t("buildUpdateMixedBuild")}</dt>
              <dd>
                {notice.chunkFailure.mixedBuildAssetsDetected ? notice.chunkFailure.mixedBuildReason ?? "detected" : "no"}
              </dd>
            </dl>
          </details>
        ) : null}
      </div>
      <button type="button" className="primary-button" onClick={() => void handleUpdate()} disabled={updating}>
        {updating ? t("buildUpdateUpdating") : t("buildUpdateAction")}
      </button>
    </aside>
  );
}
