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
  walletDisconnect: "Wallet disconnect",
  localCache: "Local and session storage",
  indexedDb: "IndexedDB",
  cacheStorage: "Service Worker cache",
  serviceWorkers: "Service Worker registrations",
};

const DEEPSIGNAL_STORAGE_PREFIXES = ["deepsignal.", "deepsignal:"];
const DEEPSIGNAL_NAME_MARKERS = ["deepsignal", "deep-signal", "walrus-feedback-lab"];

export const RESET_CONFIRMATION_MESSAGE =
  "Reset local DeepSignal data on this device? Your on-chain forms and submissions will not be deleted, but cached sessions and local encryption state will be cleared.";

export const RESET_SUCCESS_MESSAGE =
  "Local DeepSignal state has been reset. Please reconnect your wallet.";

export const RESET_FAILURE_MESSAGE =
  "Some local data could not be cleared. You may need to remove the PWA or clear website data from iOS Settings.";

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
      return createResult("localCache", "skipped", "Browser storage is not available in this environment.");
    }
    clearSealSessionCache();
    const removedLocalKeys = window.localStorage ? removeMatchingStorageKeys(window.localStorage) : [];
    const removedSessionKeys = window.sessionStorage ? removeMatchingStorageKeys(window.sessionStorage) : [];
    const removedCount = removedLocalKeys.length + removedSessionKeys.length;
    return createResult(
      "localCache",
      "success",
      `${removedCount} DeepSignal storage key${removedCount === 1 ? "" : "s"} and in-memory Seal session cache cleared.`,
    );
  } catch (error) {
    return createResult("localCache", "failed", "Could not clear browser local cache.", error);
  }
}

export async function clearIndexedDb(): Promise<ResetOperationResult> {
  try {
    if (typeof indexedDB === "undefined") {
      return createResult("indexedDb", "skipped", "IndexedDB is not available in this browser.");
    }
    if (typeof indexedDB.databases !== "function") {
      return createResult("indexedDb", "skipped", "This browser does not expose indexedDB.databases().");
    }

    const databases = await indexedDB.databases();
    const names = databases
      .map((database) => database.name)
      .filter((name): name is string => Boolean(name && isDeepSignalNamedResource(name)));

    if (names.length === 0) {
      return createResult("indexedDb", "success", "No DeepSignal IndexedDB databases found.");
    }

    const statuses = await Promise.all(names.map((name) => deleteDatabase(name)));
    const failedCount = statuses.filter((status) => status === "failed").length;
    if (failedCount > 0) {
      return createResult("indexedDb", "failed", `${names.length - failedCount}/${names.length} DeepSignal IndexedDB databases deleted.`);
    }
    return createResult("indexedDb", "success", `${names.length} DeepSignal IndexedDB database${names.length === 1 ? "" : "s"} deleted.`);
  } catch (error) {
    return createResult("indexedDb", "failed", "Could not enumerate or delete IndexedDB databases.", error);
  }
}

export async function clearServiceWorkerCache(): Promise<ResetOperationResult> {
  try {
    if (typeof caches === "undefined") {
      return createResult("cacheStorage", "skipped", "Cache Storage is not available in this browser.");
    }
    const keys = await caches.keys();
    const deepSignalKeys = keys.filter(isDeepSignalNamedResource);
    await Promise.all(deepSignalKeys.map((key) => caches.delete(key)));
    return createResult("cacheStorage", "success", `${deepSignalKeys.length} DeepSignal cache${deepSignalKeys.length === 1 ? "" : "s"} deleted.`);
  } catch (error) {
    return createResult("cacheStorage", "failed", "Could not clear Cache Storage.", error);
  }
}

export async function unregisterServiceWorkers(): Promise<ResetOperationResult> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return createResult("serviceWorkers", "skipped", "Service workers are not available in this browser.");
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
      `${deepSignalRegistrations.length} DeepSignal service worker registration${deepSignalRegistrations.length === 1 ? "" : "s"} unregistered. Reload the page to finish.`,
    );
  } catch (error) {
    return createResult("serviceWorkers", "failed", "Could not unregister service workers.", error);
  }
}

export async function disconnectWalletForReset(
  disconnectWallet?: () => Promise<void>,
): Promise<ResetOperationResult> {
  if (!disconnectWallet) {
    return createResult("walletDisconnect", "skipped", "No wallet disconnect handler was provided.");
  }
  try {
    await disconnectWallet();
    return createResult("walletDisconnect", "success", "Wallet session disconnected.");
  } catch (error) {
    return createResult("walletDisconnect", "failed", "Could not disconnect wallet session.", error);
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
