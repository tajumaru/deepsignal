import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import {
  subscribeToBuildUpdateNotices,
  updateDeepSignalToLatest,
  type BuildUpdateNotice,
} from "../../lib/buildUpdate";

const buildUpdateDismissedKey = "deepsignal.buildUpdate.dismissed";

function readBuildUpdateDismissed() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(buildUpdateDismissedKey) === "true";
  } catch {
    return false;
  }
}

export function BuildUpdateBanner() {
  const { t } = useI18n();
  const [notice, setNotice] = useState<BuildUpdateNotice | null>(null);
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(readBuildUpdateDismissed);

  useEffect(() => subscribeToBuildUpdateNotices(setNotice), []);

  const visible = Boolean(notice) && !dismissed;

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    document.body.classList.toggle("deepsignal-build-update-visible", visible);
    return () => {
      document.body.classList.remove("deepsignal-build-update-visible");
    };
  }, [visible]);

  if (!visible || !notice) {
    return null;
  }

  async function handleUpdate() {
    const targetNotice = notice;
    if (!targetNotice) {
      return;
    }

    setUpdating(true);
    try {
      await updateDeepSignalToLatest(targetNotice);
    } catch (error) {
      setUpdating(false);
      console.warn("[DeepSignal update] update action failed", error);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(buildUpdateDismissedKey, "true");
    } catch {
      // Best effort only.
    }
  }

  return (
    <aside className="build-update-banner" role="status" aria-live="polite">
      <div className="build-update-banner-shell">
        <div className="build-update-copy">
          <strong>{t("buildUpdateAvailableTitle")}</strong>
          <p>{t("buildUpdatePreservation")}</p>
        </div>
        <div className="build-update-actions" aria-label={t("buildUpdateAvailableTitle")}>
          <button
            type="button"
            className="build-update-dismiss-button"
            onClick={handleDismiss}
            disabled={updating}
          >
            {t("buildUpdateDismiss")}
          </button>
          <button
            type="button"
            className="build-update-secure-button"
            onClick={() => void handleUpdate()}
            disabled={updating}
          >
            <span className="build-update-sync-icon" aria-hidden="true">
              {updating ? "\u27f3" : "\u21bb"}
            </span>
            <span className="build-update-button-label">{updating ? t("buildUpdatePreparing") : t("buildUpdateAction")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
