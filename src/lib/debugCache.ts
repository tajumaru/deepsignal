import { clearSealSessionCache } from "../crypto/sealClientAdapter";

const LOCAL_POLICY_CACHE_KEYS = new Set([
  "deepsignal.projectRegistry.recentProjects",
  "deepsignal.projectRegistry.selectedProjectId",
  "deepsignal.formMetadataOverlays",
]);

const LOCAL_POLICY_CACHE_PREFIXES = [
  "deepsignal.seal.",
  "deepsignal.access.",
  "deepsignal.capability.",
  "deepsignal.policy.",
];

const SESSION_POLICY_CACHE_PREFIXES = [
  "deepsignal.",
];

function removeMatchingStorageKeys(
  storage: Storage,
  predicate: (key: string) => boolean,
) {
  const removed: string[] = [];
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && predicate(key)) {
      storage.removeItem(key);
      removed.push(key);
    }
  }
  return removed.sort();
}

async function clearDeepSignalIndexedDb() {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") {
    return [] as string[];
  }
  const databases = await indexedDB.databases();
  const names = databases
    .map((database) => database.name)
    .filter((name): name is string => Boolean(name && name.toLowerCase().includes("deepsignal")));
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        }),
    ),
  );
  return names.sort();
}

export async function clearDeepSignalPolicyCapabilityCache() {
  clearSealSessionCache();
  const removedLocalStorageKeys =
    typeof window === "undefined"
      ? []
      : removeMatchingStorageKeys(
          window.localStorage,
          (key) =>
            LOCAL_POLICY_CACHE_KEYS.has(key) ||
            LOCAL_POLICY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)),
        );
  const removedSessionStorageKeys =
    typeof window === "undefined"
      ? []
      : removeMatchingStorageKeys(
          window.sessionStorage,
          (key) => SESSION_POLICY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)),
        );
  const removedIndexedDbNames =
    typeof window === "undefined" ? [] : await clearDeepSignalIndexedDb();

  const result = {
    removedLocalStorageKeys,
    removedSessionStorageKeys,
    removedIndexedDbNames,
    clearedInMemorySealSessionCache: true,
  };
  console.debug("[deepsignal-cache]", "cleared_policy_capability_cache", result);
  return result;
}
