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

export interface ResetEnvironmentMessages {
  confirmation: string;
  success: string;
  failure: string;
  operationLabels: Record<ResetOperation, string>;
  browserStorageUnavailable: string;
  localCacheCleared: (removedCount: number) => string;
  localCacheFailed: string;
  indexedDbUnavailable: string;
  indexedDbDatabasesUnavailable: string;
  indexedDbNotFound: string;
  indexedDbPartialDelete: (totalCount: number, deletedCount: number) => string;
  indexedDbDeleted: (count: number) => string;
  indexedDbFailed: string;
  cacheStorageUnavailable: string;
  cacheStorageDeleted: (count: number) => string;
  cacheStorageFailed: string;
  serviceWorkerUnavailable: string;
  serviceWorkersUnregistered: (count: number) => string;
  serviceWorkersFailed: string;
  walletDisconnectMissing: string;
  walletDisconnected: string;
  walletDisconnectFailed: string;
}

export const DEFAULT_RESET_ENVIRONMENT_MESSAGES: ResetEnvironmentMessages = {
  confirmation:
    "Reset DeepSignal local data on this device? On-chain forms and submitted signals will not be deleted, but cached sessions and local encryption state will be removed.",
  success: "DeepSignal local state has been reset. Reconnect your wallet to continue.",
  failure:
    "Some local data could not be removed. You may need to delete the PWA or clear website data from iOS settings.",
  operationLabels: {
    walletDisconnect: "Wallet disconnect",
    localCache: "Local / session storage",
    indexedDb: "IndexedDB",
    cacheStorage: "Service Worker cache",
    serviceWorkers: "Service Worker registration",
  },
  browserStorageUnavailable: "Browser storage is unavailable in this environment.",
  localCacheCleared: (removedCount) =>
    `Removed ${removedCount} DeepSignal storage key(s) and cleared the in-memory Seal session cache.`,
  localCacheFailed: "Could not clear browser local cache.",
  indexedDbUnavailable: "IndexedDB is unavailable in this browser.",
  indexedDbDatabasesUnavailable: "indexedDB.databases() is not exposed in this browser.",
  indexedDbNotFound: "No DeepSignal IndexedDB databases were found.",
  indexedDbPartialDelete: (totalCount, deletedCount) =>
    `Deleted ${deletedCount} of ${totalCount} DeepSignal IndexedDB database(s).`,
  indexedDbDeleted: (count) => `Deleted ${count} DeepSignal IndexedDB database(s).`,
  indexedDbFailed: "Could not enumerate or delete IndexedDB databases.",
  cacheStorageUnavailable: "Cache Storage is unavailable in this browser.",
  cacheStorageDeleted: (count) => `Deleted ${count} DeepSignal cache entry/entries.`,
  cacheStorageFailed: "Could not clear Cache Storage.",
  serviceWorkerUnavailable: "Service Workers are unavailable in this browser.",
  serviceWorkersUnregistered: (count) =>
    `Unregistered ${count} DeepSignal Service Worker registration(s). Reload the page to finish.`,
  serviceWorkersFailed: "Could not unregister Service Worker registrations.",
  walletDisconnectMissing: "No wallet disconnect handler was provided.",
  walletDisconnected: "Wallet session disconnected.",
  walletDisconnectFailed: "Could not disconnect the wallet session.",
};

const RESET_LABELS: Record<ResetOperation, string> = {
  walletDisconnect: "Wallet disconnect",
  localCache: "Local / session storage",
  indexedDb: "IndexedDB",
  cacheStorage: "Service Worker cache",
  serviceWorkers: "Service Worker registration",
};

const DEEPSIGNAL_STORAGE_PREFIXES = ["deepsignal.", "deepsignal:"];
const DEEPSIGNAL_NAME_MARKERS = ["deepsignal", "deep-signal", "walrus-feedback-lab"];
const PRESERVED_LOCAL_STORAGE_KEYS = new Set([
  "deepsignal.forms",
  "deepsignal.submissions",
  "deepsignal.files",
  "deepsignal.encryptedPayloads",
  "deepsignal.myResponseHistory.v1",
  "deepsignal.submittedHistory.v1",
  "deepsignal:create-form-draft:v1",
  "deepsignal:create-form-guest-draft:v1",
]);
const PRESERVED_LOCAL_STORAGE_PREFIXES = [
  "deepsignal:public-draft:",
];

export const RESET_CONFIRMATION_MESSAGE =
  DEFAULT_RESET_ENVIRONMENT_MESSAGES.confirmation;

export const RESET_SUCCESS_MESSAGE =
  DEFAULT_RESET_ENVIRONMENT_MESSAGES.success;

export const RESET_FAILURE_MESSAGE =
  DEFAULT_RESET_ENVIRONMENT_MESSAGES.failure;

async function clearWalletSessionStorageSafely() {
  try {
    const module = await import("./walletSessionReset");
    module.clearWalletSessionStorage();
  } catch (error) {
    console.warn("Wallet session storage could not be cleared eagerly.", error);
  }
}

function createResult(
  operation: ResetOperation,
  status: ResetStatus,
  detail: string,
  error?: unknown,
  messages: ResetEnvironmentMessages = DEFAULT_RESET_ENVIRONMENT_MESSAGES,
): ResetOperationResult {
  return {
    operation,
    label: messages.operationLabels[operation] ?? RESET_LABELS[operation],
    status,
    detail,
    error: error instanceof Error ? error.message : typeof error === "string" ? error : undefined,
  };
}

function isDeepSignalStorageKey(key: string) {
  return DEEPSIGNAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function isPreservedLocalStorageKey(key: string) {
  return (
    PRESERVED_LOCAL_STORAGE_KEYS.has(key) ||
    PRESERVED_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function isDeepSignalNamedResource(name: string) {
  const normalized = name.toLowerCase();
  return DEEPSIGNAL_NAME_MARKERS.some((marker) => normalized.includes(marker));
}

function removeMatchingStorageKeys(storage: Storage, options: { preserveUserData?: boolean } = {}) {
  const removed: string[] = [];
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && isDeepSignalStorageKey(key) && !(options.preserveUserData && isPreservedLocalStorageKey(key))) {
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

async function clearSealSessionCacheSafely() {
  try {
    const module = await import("../crypto/sealClientAdapter");
    module.clearSealSessionCache();
  } catch (error) {
    console.warn("Seal session cache could not be cleared eagerly.", error);
  }
}

export async function clearLocalCache(
  messages: ResetEnvironmentMessages = DEFAULT_RESET_ENVIRONMENT_MESSAGES,
): Promise<ResetOperationResult> {
  try {
    if (typeof window === "undefined") {
      return createResult("localCache", "skipped", messages.browserStorageUnavailable, undefined, messages);
    }
    await clearSealSessionCacheSafely();
    await clearWalletSessionStorageSafely();
    const removedLocalKeys = window.localStorage
      ? removeMatchingStorageKeys(window.localStorage, { preserveUserData: true })
      : [];
    const removedSessionKeys = window.sessionStorage ? removeMatchingStorageKeys(window.sessionStorage) : [];
    const removedCount = removedLocalKeys.length + removedSessionKeys.length;
    return createResult(
      "localCache",
      "success",
      messages.localCacheCleared(removedCount),
      undefined,
      messages,
    );
  } catch (error) {
    return createResult("localCache", "failed", messages.localCacheFailed, error, messages);
  }
}

export async function clearIndexedDb(
  messages: ResetEnvironmentMessages = DEFAULT_RESET_ENVIRONMENT_MESSAGES,
): Promise<ResetOperationResult> {
  try {
    if (typeof indexedDB === "undefined") {
      return createResult("indexedDb", "skipped", messages.indexedDbUnavailable, undefined, messages);
    }
    if (typeof indexedDB.databases !== "function") {
      return createResult("indexedDb", "skipped", messages.indexedDbDatabasesUnavailable, undefined, messages);
    }

    const databases = await indexedDB.databases();
    const names = databases
      .map((database) => database.name)
      .filter((name): name is string => Boolean(name && isDeepSignalNamedResource(name)));

    if (names.length === 0) {
      return createResult("indexedDb", "success", messages.indexedDbNotFound, undefined, messages);
    }

    const statuses = await Promise.all(names.map((name) => deleteDatabase(name)));
    const failedCount = statuses.filter((status) => status === "failed").length;
    if (failedCount > 0) {
      return createResult(
        "indexedDb",
        "failed",
        messages.indexedDbPartialDelete(names.length, names.length - failedCount),
        undefined,
        messages,
      );
    }
    return createResult("indexedDb", "success", messages.indexedDbDeleted(names.length), undefined, messages);
  } catch (error) {
    return createResult("indexedDb", "failed", messages.indexedDbFailed, error, messages);
  }
}

export async function clearServiceWorkerCache(
  messages: ResetEnvironmentMessages = DEFAULT_RESET_ENVIRONMENT_MESSAGES,
): Promise<ResetOperationResult> {
  try {
    if (typeof caches === "undefined") {
      return createResult("cacheStorage", "skipped", messages.cacheStorageUnavailable, undefined, messages);
    }
    const keys = await caches.keys();
    const deepSignalKeys = keys.filter(isDeepSignalNamedResource);
    await Promise.all(deepSignalKeys.map((key) => caches.delete(key)));
    return createResult(
      "cacheStorage",
      "success",
      messages.cacheStorageDeleted(deepSignalKeys.length),
      undefined,
      messages,
    );
  } catch (error) {
    return createResult("cacheStorage", "failed", messages.cacheStorageFailed, error, messages);
  }
}

export async function unregisterServiceWorkers(
  messages: ResetEnvironmentMessages = DEFAULT_RESET_ENVIRONMENT_MESSAGES,
): Promise<ResetOperationResult> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return createResult("serviceWorkers", "skipped", messages.serviceWorkerUnavailable, undefined, messages);
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
      messages.serviceWorkersUnregistered(deepSignalRegistrations.length),
      undefined,
      messages,
    );
  } catch (error) {
    return createResult("serviceWorkers", "failed", messages.serviceWorkersFailed, error, messages);
  }
}

export async function disconnectWalletForReset(
  disconnectWallet?: () => Promise<void>,
  messages: ResetEnvironmentMessages = DEFAULT_RESET_ENVIRONMENT_MESSAGES,
): Promise<ResetOperationResult> {
  if (!disconnectWallet) {
    return createResult("walletDisconnect", "skipped", messages.walletDisconnectMissing, undefined, messages);
  }
  try {
    await disconnectWallet();
    return createResult("walletDisconnect", "success", messages.walletDisconnected, undefined, messages);
  } catch (error) {
    return createResult("walletDisconnect", "failed", messages.walletDisconnectFailed, error, messages);
  }
}

export function didResetFullySucceed(results: ResetOperationResult[]) {
  return results.every((result) => result.status === "success" || result.status === "skipped");
}

export async function resetLocalEnvironment(
  options: {
    includeWalletDisconnect?: boolean;
    disconnectWallet?: () => Promise<void>;
    messages?: ResetEnvironmentMessages;
  } = {},
) {
  const messages = options.messages ?? DEFAULT_RESET_ENVIRONMENT_MESSAGES;
  const results: ResetOperationResult[] = [];
  if (options.includeWalletDisconnect) {
    results.push(await disconnectWalletForReset(options.disconnectWallet, messages));
  }
  results.push(await clearLocalCache(messages));
  results.push(await clearIndexedDb(messages));
  results.push(await clearServiceWorkerCache(messages));
  results.push(await unregisterServiceWorkers(messages));
  return results;
}
