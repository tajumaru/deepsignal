import { useState } from "react";
import { useDisconnectWallet } from "@mysten/dapp-kit";
import {
  clearIndexedDb,
  clearLocalCache,
  clearServiceWorkerCache,
  didResetFullySucceed,
  RESET_CONFIRMATION_MESSAGE,
  RESET_FAILURE_MESSAGE,
  RESET_SUCCESS_MESSAGE,
  resetLocalEnvironment,
  type ResetOperationResult,
  unregisterServiceWorkers,
} from "../../lib/resetEnvironment";

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

function statusLabel(status: ResetOperationResult["status"]) {
  switch (status) {
    case "success":
      return "成功";
    case "failed":
      return "失敗";
    case "skipped":
      return "スキップ";
  }
}

export function ResetEnvironmentPanel() {
  const disconnectWallet = useDisconnectWallet();
  const [results, setResults] = useState<ResetOperationResult[]>([]);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [toast, setToast] = useState<ResetToast | null>(null);

  async function runConfirmedReset(
    actionKey: string,
    action: () => Promise<ResetOperationResult[]>,
    options: { reloadAfterSuccess?: boolean } = {},
  ) {
    if (typeof window !== "undefined" && !window.confirm(RESET_CONFIRMATION_MESSAGE)) {
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
        message: succeeded ? RESET_SUCCESS_MESSAGE : RESET_FAILURE_MESSAGE,
      });

      if (options.reloadAfterSuccess && succeeded && typeof window !== "undefined") {
        window.setTimeout(() => {
          window.location.assign("/");
        }, 900);
      }
    } catch {
      setToast({ tone: "error", message: RESET_FAILURE_MESSAGE });
    } finally {
      setRunningAction(null);
    }
  }

  const actions: ResetAction[] = [
    {
      key: "localCache",
      title: "ローカルキャッシュを削除",
      body: "このデバイス上の DeepSignal localStorage/sessionStorage キーと、メモリ内の Seal 復号セッションキャッシュを削除します。",
      run: async () => [await clearLocalCache()],
    },
    {
      key: "indexedDb",
      title: "IndexedDB を削除",
      body: "indexedDB.databases() に対応している場合、DeepSignal 名義のブラウザデータベースを削除します。古い Safari では安全にスキップされます。",
      run: async () => [await clearIndexedDb()],
    },
    {
      key: "cacheStorage",
      title: "Service Worker キャッシュを削除",
      body: "アップグレード後も古い PWA アセットを保持する可能性がある、DeepSignal 名義の Cache Storage エントリを削除します。",
      run: async () => [await clearServiceWorkerCache()],
    },
    {
      key: "serviceWorkers",
      title: "Service Worker 登録を解除",
      body: "DeepSignal 名義の Service Worker 登録を解除します。実行後に DeepSignal を再読み込みすると、Safari または PWA シェルが新しい状態で起動します。",
      run: async () => [await unregisterServiceWorkers()],
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
          <p className="eyebrow">トラブルシューティング / リセット</p>
          <h1>DeepSignal 環境をリセット</h1>
          <p className="lede">
            iPhone Safari、Slush Wallet、インストール済み PWA に古いローカル状態が残り、再接続後も Seal の復号リクエストが失敗する場合に使用します。
          </p>
        </div>
        <div className="reset-environment-warning" role="note">
          DeepSignal はローカルのアプリ状態、暗号化キャッシュ、ブラウザストレージを削除できます。ウォレットの秘密鍵や Slush Wallet 内部データは削除できません。
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
              {runningAction === action.key ? "削除中..." : action.title}
            </button>
          </article>
        ))}
      </div>

      {results.length > 0 ? (
        <section className="panel reset-results-panel" aria-live="polite">
          <div className="section-row">
            <div>
              <p className="eyebrow">直近の実行</p>
              <h2>リセット結果</h2>
            </div>
          </div>
          <div className="reset-results-list">
            {results.map((result) => (
              <div key={result.operation} className={`reset-result-row is-${result.status}`}>
                <span>{result.label}</span>
                <strong>{statusLabel(result.status)}</strong>
                <p>{result.error ? `${result.detail} ${result.error}` : result.detail}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel reset-ios-note">
        <p className="eyebrow">iPhone Safari / PWA</p>
        <h2>古いデータがまだ残る場合</h2>
        <p>
          iOS は Web サイトデータ、ウォレット連携状態、インストール済み PWA シェルを DeepSignal の制御外に保持することがあります。リセットで消し切れない場合は、
          ホーム画面から PWA を削除するか、iOS 設定で DeepSignal の Web サイトデータを削除してからウォレットを再接続してください。
        </p>
      </section>

      <section className="panel reset-all-zone">
        <div>
          <p className="eyebrow">危険ゾーン</p>
          <h2>すべてリセット</h2>
          <p>
            現在のウォレットセッションを切断し、DeepSignal のブラウザストレージ、IndexedDB、Cache Storage エントリを削除し、
            DeepSignal の Service Worker 登録を解除してから DeepSignal のホーム画面へ戻ります。オンチェーンフォーム、Walrus blob、送信済みシグナルは削除されません。
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
                  includeWalletDisconnect: true,
                  disconnectWallet: () => disconnectWallet.mutateAsync(),
                }),
              { reloadAfterSuccess: true },
            )
          }
        >
          {runningAction === "resetAll" ? "リセット中..." : "すべてリセット"}
        </button>
      </section>
    </section>
  );
}
