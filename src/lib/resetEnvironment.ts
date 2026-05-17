import { clearSealSessionCache } from "../crypto/sealClientAdapter";

export type ResetOperation =
  | "walletDisconnect"
  | "localCache"
  | "indexedDb"
  | "cacheStorage"
  | "serviceWorkers";

export type ResetStatus = "success" | "failed" | "skipped";

export interface ResetOperationResult {
  operation: ResetOperation;
  label: string;
  status: ResetStatus;
  detail: string;
  error?: string;
}

const RESET_LABELS: Record<ResetOperation, string> = {
  walletDisconnect: "ウォレット切断",
  localCache: "ローカル / セッションストレージ",
  indexedDb: "IndexedDB",
  cacheStorage: "Service Worker キャッシュ",
  serviceWorkers: "Service Worker 登録",
};

const DEEPSIGNAL_STORAGE_PREFIXES = ["deepsignal.", "deepsignal:"];
const DEEPSIGNAL_NAME_MARKERS = ["deepsignal", "deep-signal", "walrus-feedback-lab"];

export const RESET_CONFIRMATION_MESSAGE =
  "このデバイス上の DeepSignal ローカルデータをリセットしますか？オンチェーンフォームと送信内容は削除されませんが、キャッシュ済みセッションとローカルの暗号化状態は削除されます。";

export const RESET_SUCCESS_MESSAGE =
  "DeepSignal のローカル状態をリセットしました。ウォレットを再接続してください。";

export const RESET_FAILURE_MESSAGE =
  "一部のローカルデータを削除できませんでした。PWA を削除するか、iOS 設定から Web サイトデータを削除する必要があるかもしれません。";

function createResult(
  operation: ResetOperation,
  status: ResetStatus,
  detail: string,
  error?: unknown,
): ResetOperationResult {
  return {
    operation,
    label: RESET_LABELS[operation],
    status,
    detail,
    error: error instanceof Error ? error.message : typeof error === "string" ? error : undefined,
  };
}

function isDeepSignalStorageKey(key: string) {
  return DEEPSIGNAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function isDeepSignalNamedResource(name: string) {
  const normalized = name.toLowerCase();
  return DEEPSIGNAL_NAME_MARKERS.some((marker) => normalized.includes(marker));
}

function removeMatchingStorageKeys(storage: Storage) {
  const removed: string[] = [];
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && isDeepSignalStorageKey(key)) {
      storage.removeItem(key);
      removed.push(key);
    }
  }
  return removed.sort();
}

function deleteDatabase(name: string) {
  return new Promise<ResetStatus>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve("success");
    request.onerror = () => resolve("failed");
    request.onblocked = () => resolve("failed");
  });
}

export async function clearLocalCache(): Promise<ResetOperationResult> {
  try {
    if (typeof window === "undefined") {
      return createResult("localCache", "skipped", "この環境ではブラウザストレージを利用できません。");
    }
    clearSealSessionCache();
    const removedLocalKeys = window.localStorage ? removeMatchingStorageKeys(window.localStorage) : [];
    const removedSessionKeys = window.sessionStorage ? removeMatchingStorageKeys(window.sessionStorage) : [];
    const removedCount = removedLocalKeys.length + removedSessionKeys.length;
    return createResult(
      "localCache",
      "success",
      `${removedCount} 件の DeepSignal ストレージキーと、メモリ内の Seal セッションキャッシュを削除しました。`,
    );
  } catch (error) {
    return createResult("localCache", "failed", "ブラウザのローカルキャッシュを削除できませんでした。", error);
  }
}

export async function clearIndexedDb(): Promise<ResetOperationResult> {
  try {
    if (typeof indexedDB === "undefined") {
      return createResult("indexedDb", "skipped", "このブラウザでは IndexedDB を利用できません。");
    }
    if (typeof indexedDB.databases !== "function") {
      return createResult("indexedDb", "skipped", "このブラウザでは indexedDB.databases() が公開されていません。");
    }

    const databases = await indexedDB.databases();
    const names = databases
      .map((database) => database.name)
      .filter((name): name is string => Boolean(name && isDeepSignalNamedResource(name)));

    if (names.length === 0) {
      return createResult("indexedDb", "success", "DeepSignal の IndexedDB データベースは見つかりませんでした。");
    }

    const statuses = await Promise.all(names.map((name) => deleteDatabase(name)));
    const failedCount = statuses.filter((status) => status === "failed").length;
    if (failedCount > 0) {
      return createResult("indexedDb", "failed", `${names.length} 件中 ${names.length - failedCount} 件の DeepSignal IndexedDB データベースを削除しました。`);
    }
    return createResult("indexedDb", "success", `${names.length} 件の DeepSignal IndexedDB データベースを削除しました。`);
  } catch (error) {
    return createResult("indexedDb", "failed", "IndexedDB データベースの列挙または削除ができませんでした。", error);
  }
}

export async function clearServiceWorkerCache(): Promise<ResetOperationResult> {
  try {
    if (typeof caches === "undefined") {
      return createResult("cacheStorage", "skipped", "このブラウザでは Cache Storage を利用できません。");
    }
    const keys = await caches.keys();
    const deepSignalKeys = keys.filter(isDeepSignalNamedResource);
    await Promise.all(deepSignalKeys.map((key) => caches.delete(key)));
    return createResult("cacheStorage", "success", `${deepSignalKeys.length} 件の DeepSignal キャッシュを削除しました。`);
  } catch (error) {
    return createResult("cacheStorage", "failed", "Cache Storage を削除できませんでした。", error);
  }
}

export async function unregisterServiceWorkers(): Promise<ResetOperationResult> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return createResult("serviceWorkers", "skipped", "このブラウザでは Service Worker を利用できません。");
    }
    const registrations = await navigator.serviceWorker.getRegistrations();
    const deepSignalRegistrations = registrations.filter(
      (registration) =>
        isDeepSignalNamedResource(registration.scope) ||
        isDeepSignalNamedResource(registration.active?.scriptURL ?? "") ||
        isDeepSignalNamedResource(registration.installing?.scriptURL ?? "") ||
        isDeepSignalNamedResource(registration.waiting?.scriptURL ?? ""),
    );
    await Promise.all(deepSignalRegistrations.map((registration) => registration.unregister()));
    return createResult(
      "serviceWorkers",
      "success",
      `${deepSignalRegistrations.length} 件の DeepSignal Service Worker 登録を解除しました。完了するにはページを再読み込みしてください。`,
    );
  } catch (error) {
    return createResult("serviceWorkers", "failed", "Service Worker 登録を解除できませんでした。", error);
  }
}

export async function disconnectWalletForReset(
  disconnectWallet?: () => Promise<void>,
): Promise<ResetOperationResult> {
  if (!disconnectWallet) {
    return createResult("walletDisconnect", "skipped", "ウォレット切断ハンドラーが指定されていません。");
  }
  try {
    await disconnectWallet();
    return createResult("walletDisconnect", "success", "ウォレットセッションを切断しました。");
  } catch (error) {
    return createResult("walletDisconnect", "failed", "ウォレットセッションを切断できませんでした。", error);
  }
}

export function didResetFullySucceed(results: ResetOperationResult[]) {
  return results.every((result) => result.status === "success" || result.status === "skipped");
}

export async function resetLocalEnvironment(
  options: {
    includeWalletDisconnect?: boolean;
    disconnectWallet?: () => Promise<void>;
  } = {},
) {
  const results: ResetOperationResult[] = [];
  if (options.includeWalletDisconnect) {
    results.push(await disconnectWalletForReset(options.disconnectWallet));
  }
  results.push(await clearLocalCache());
  results.push(await clearIndexedDb());
  results.push(await clearServiceWorkerCache());
  results.push(await unregisterServiceWorkers());
  return results;
}
