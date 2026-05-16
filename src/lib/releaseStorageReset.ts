const RESET_TOKEN_KEY = "deepsignal.releaseStorageReset.appliedToken";

const FORM_STORAGE_KEYS = [
  "deepsignal.forms",
  "deepsignal.submissions",
  "deepsignal.files",
  "deepsignal.encryptedPayloads",
  "deepsignal.walrus.index",
  "deepsignal.formMetadataOverlays",
  "deepsignal.exportAuditLog.v1",
  "deepsignal.exploreDeletedForms",
  "deepsignal:create-form-draft:v1",
  "deepsignal:create-form-guest-draft:v1",
];

const FORM_STORAGE_PREFIXES = ["deepsignal:public-draft:"];

function removePrefixedStorageKeys(storage: Storage, prefixes: string[]) {
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
}

export function applyReleaseStorageReset() {
  if (typeof window === "undefined") {
    return;
  }

  const resetToken = String(import.meta.env.VITE_RELEASE_STORAGE_RESET_TOKEN ?? "").trim();
  if (!resetToken) {
    return;
  }

  try {
    const appliedToken = window.localStorage.getItem(RESET_TOKEN_KEY);
    if (appliedToken === resetToken) {
      return;
    }

    FORM_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    removePrefixedStorageKeys(window.localStorage, FORM_STORAGE_PREFIXES);
    window.localStorage.setItem(RESET_TOKEN_KEY, resetToken);
  } catch (error) {
    console.warn("Release storage reset could not be applied.", error);
  }
}
