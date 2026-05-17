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
      return "Success";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
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
      title: "Clear Local Cache",
      body: "Clears DeepSignal localStorage/sessionStorage keys and the in-memory Seal decrypt session cache on this device.",
      run: async () => [await clearLocalCache()],
    },
    {
      key: "indexedDb",
      title: "Clear IndexedDB",
      body: "Deletes DeepSignal-named browser databases when indexedDB.databases() is supported. Older Safari builds are safely skipped.",
      run: async () => [await clearIndexedDb()],
    },
    {
      key: "cacheStorage",
      title: "Clear Service Worker Cache",
      body: "Deletes DeepSignal-named Cache Storage entries that can keep stale PWA assets alive after upgrades.",
      run: async () => [await clearServiceWorkerCache()],
    },
    {
      key: "serviceWorkers",
      title: "Unregister Service Worker",
      body: "Removes DeepSignal-named service worker registrations. Reload DeepSignal after this so Safari or the PWA shell starts fresh.",
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
          <p className="eyebrow">Troubleshooting / Reset</p>
          <h1>Reset DeepSignal Environment</h1>
          <p className="lede">
            Use this when iPhone Safari, Slush Wallet, or the installed PWA keeps stale local state and Seal decrypt
            requests fail after reconnecting.
          </p>
        </div>
        <div className="reset-environment-warning" role="note">
          DeepSignal can clear local app state, encryption cache, and browser storage. It cannot delete your wallet's
          private keys or internal Slush Wallet data.
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
              {runningAction === action.key ? "Clearing..." : action.title}
            </button>
          </article>
        ))}
      </div>

      {results.length > 0 ? (
        <section className="panel reset-results-panel" aria-live="polite">
          <div className="section-row">
            <div>
              <p className="eyebrow">Last Run</p>
              <h2>Reset results</h2>
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
        <h2>When stale data still remains</h2>
        <p>
          iOS can keep website data, wallet handoff state, or an installed PWA shell outside DeepSignal's control. If
          reset cannot clear everything, remove the PWA from the Home Screen or clear website data for DeepSignal in iOS
          Settings, then reconnect your wallet.
        </p>
      </section>

      <section className="panel reset-all-zone">
        <div>
          <p className="eyebrow">Danger Zone</p>
          <h2>Reset All</h2>
          <p>
            Disconnects the current wallet session, clears DeepSignal browser storage, deletes DeepSignal IndexedDB and
            Cache Storage entries, unregisters DeepSignal service workers, then returns to the DeepSignal home screen.
            On-chain forms, Walrus blobs, and submitted signals are not deleted.
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
          {runningAction === "resetAll" ? "Resetting..." : "Reset All"}
        </button>
      </section>
    </section>
  );
}
