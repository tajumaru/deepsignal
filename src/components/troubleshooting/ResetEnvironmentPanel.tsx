import { useMemo, useState } from "react";
import {
  clearIndexedDb,
  clearLocalCache,
  clearServiceWorkerCache,
  didResetFullySucceed,
  resetLocalEnvironment,
  type ResetEnvironmentMessages,
  type ResetOperationResult,
  unregisterServiceWorkers,
} from "../../lib/resetEnvironment";
import { useI18n } from "../../i18n";

type ResetToast = {
  tone: "success" | "error";
  message: string;
};

interface ResetAction {
  key: string;
  title: string;
  body: string;
  danger?: boolean;
  run: () => Promise<ResetOperationResult[]>;
}

function statusLabel(status: ResetOperationResult["status"], t: (key: string) => string) {
  switch (status) {
    case "success":
      return t("resetStatusSuccess");
    case "failed":
      return t("resetStatusFailed");
    case "skipped":
      return t("resetStatusSkipped");
  }
}

export function ResetEnvironmentPanel() {
  const { t } = useI18n();
  const [results, setResults] = useState<ResetOperationResult[]>([]);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [toast, setToast] = useState<ResetToast | null>(null);
  const resetMessages = useMemo<ResetEnvironmentMessages>(
    () => ({
      confirmation: t("resetConfirmationMessage"),
      success: t("resetSuccessMessage"),
      failure: t("resetFailureMessage"),
      operationLabels: {
        walletDisconnect: t("resetOperationWalletDisconnect"),
        localCache: t("resetOperationLocalCache"),
        indexedDb: t("resetOperationIndexedDb"),
        cacheStorage: t("resetOperationCacheStorage"),
        serviceWorkers: t("resetOperationServiceWorkers"),
      },
      browserStorageUnavailable: t("resetBrowserStorageUnavailable"),
      localCacheCleared: (removedCount) => t("resetLocalCacheCleared", { count: removedCount }),
      localCacheFailed: t("resetLocalCacheFailed"),
      indexedDbUnavailable: t("resetIndexedDbUnavailable"),
      indexedDbDatabasesUnavailable: t("resetIndexedDbDatabasesUnavailable"),
      indexedDbNotFound: t("resetIndexedDbNotFound"),
      indexedDbPartialDelete: (totalCount, deletedCount) =>
        t("resetIndexedDbPartialDelete", { total: totalCount, count: deletedCount }),
      indexedDbDeleted: (count) => t("resetIndexedDbDeleted", { count }),
      indexedDbFailed: t("resetIndexedDbFailed"),
      cacheStorageUnavailable: t("resetCacheStorageUnavailable"),
      cacheStorageDeleted: (count) => t("resetCacheStorageDeleted", { count }),
      cacheStorageFailed: t("resetCacheStorageFailed"),
      serviceWorkerUnavailable: t("resetServiceWorkerUnavailable"),
      serviceWorkersUnregistered: (count) => t("resetServiceWorkersUnregistered", { count }),
      serviceWorkersFailed: t("resetServiceWorkersFailed"),
      walletDisconnectMissing: t("resetWalletDisconnectMissing"),
      walletDisconnected: t("resetWalletDisconnected"),
      walletDisconnectFailed: t("resetWalletDisconnectFailed"),
    }),
    [t],
  );

  async function runConfirmedReset(
    actionKey: string,
    action: () => Promise<ResetOperationResult[]>,
    options: { reloadAfterSuccess?: boolean } = {},
  ) {
    if (typeof window !== "undefined" && !window.confirm(resetMessages.confirmation)) {
      return;
    }

    setRunningAction(actionKey);
    setToast(null);
    try {
      const nextResults = await action();
      const succeeded = didResetFullySucceed(nextResults);
      setResults(nextResults);
      setToast({
        tone: succeeded ? "success" : "error",
        message: succeeded ? resetMessages.success : resetMessages.failure,
      });

      if (options.reloadAfterSuccess && succeeded && typeof window !== "undefined") {
        window.setTimeout(() => {
          window.location.assign("/");
        }, 900);
      }
    } catch {
      setToast({ tone: "error", message: resetMessages.failure });
    } finally {
      setRunningAction(null);
    }
  }

  const actions: ResetAction[] = [
    {
      key: "localCache",
      title: t("resetActionLocalCacheTitle"),
      body: t("resetActionLocalCacheBody"),
      run: async () => [await clearLocalCache(resetMessages)],
    },
    {
      key: "indexedDb",
      title: t("resetActionIndexedDbTitle"),
      body: t("resetActionIndexedDbBody"),
      run: async () => [await clearIndexedDb(resetMessages)],
    },
    {
      key: "cacheStorage",
      title: t("resetActionCacheStorageTitle"),
      body: t("resetActionCacheStorageBody"),
      run: async () => [await clearServiceWorkerCache(resetMessages)],
    },
    {
      key: "serviceWorkers",
      title: t("resetActionServiceWorkersTitle"),
      body: t("resetActionServiceWorkersBody"),
      run: async () => [await unregisterServiceWorkers(resetMessages)],
      danger: true,
    },
  ];

  return (
    <section className="reset-environment-panel">
      {toast ? (
        <div className={`signal-toast reset-environment-toast is-${toast.tone}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}

      <div className="reset-environment-hero panel">
        <div>
          <p className="eyebrow">{t("resetHeroEyebrow")}</p>
          <h1>
            <span className="reset-copy-desktop">{t("resetHeroTitle")}</span>
            <span className="reset-copy-mobile">{t("resetHeroMobileTitle")}</span>
          </h1>
          <p className="lede">
            <span className="reset-copy-desktop">{t("resetHeroBody")}</span>
            <span className="reset-copy-mobile">{t("resetHeroMobileBody")}</span>
          </p>
        </div>
        <div className="reset-environment-warning" role="note">
          <span className="reset-copy-desktop">{t("resetHeroWarning")}</span>
          <span className="reset-copy-mobile">{t("resetHeroMobileWarning")}</span>
        </div>
      </div>

      <div className="reset-environment-grid">
        {actions.map((action) => (
          <article key={action.key} className={`panel reset-action-card ${action.danger ? "is-danger" : ""}`}>
            <div>
              <h2>{action.title}</h2>
              <p>{action.body}</p>
            </div>
            <button
              type="button"
              className={action.danger ? "danger-button reset-action-button" : "ghost-button reset-action-button"}
              disabled={Boolean(runningAction)}
              onClick={() => void runConfirmedReset(action.key, action.run)}
            >
              {runningAction === action.key ? t("resetDeletingLabel") : action.title}
            </button>
          </article>
        ))}
      </div>

      {results.length > 0 ? (
        <section className="panel reset-results-panel" aria-live="polite">
          <div className="section-row">
            <div>
              <p className="eyebrow">{t("resetResultsEyebrow")}</p>
              <h2>{t("resetResultsTitle")}</h2>
            </div>
          </div>
          <div className="reset-results-list">
            {results.map((result) => (
              <div key={result.operation} className={`reset-result-row is-${result.status}`}>
                <span>{result.label}</span>
                <strong>{statusLabel(result.status, t)}</strong>
                <p>{result.error ? `${result.detail} ${result.error}` : result.detail}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel reset-ios-note">
        <p className="eyebrow">iPhone Safari / PWA</p>
        <h2>{t("resetIosTitle")}</h2>
        <p>
          {t("resetIosBody")}
        </p>
      </section>

      <section className="panel reset-all-zone">
        <div>
          <p className="eyebrow">{t("resetDangerEyebrow")}</p>
          <h2>{t("resetAllTitle")}</h2>
          <p>
            {t("resetAllBody")}
          </p>
        </div>
        <button
          type="button"
          className="danger-button reset-all-button"
          disabled={Boolean(runningAction)}
          onClick={() =>
            void runConfirmedReset(
              "resetAll",
              () =>
                resetLocalEnvironment({
                  messages: resetMessages,
                }),
              { reloadAfterSuccess: true },
            )
          }
        >
          {runningAction === "resetAll" ? t("resettingLocalState") : t("resetAllButton")}
        </button>
      </section>
    </section>
  );
}
