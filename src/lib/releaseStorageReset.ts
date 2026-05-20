import { buildInfo } from "./buildInfo";

const RESET_TOKEN_KEY = "deepsignal.releaseStorageReset.appliedToken";
const LAST_SEEN_APP_VERSION_KEY = "deepsignal.releaseStorageReset.lastSeenAppVersion";

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

function currentAppVersion() {
  return String(buildInfo.appVersion ?? "").trim();
}

function configuredResetToken() {
  return String(import.meta.env.VITE_RELEASE_STORAGE_RESET_TOKEN ?? "").trim();
}

export function shouldApplyReleaseStorageResetOnVersionMismatch() {
  if (typeof window === "undefined") {
    return false;
  }

  const resetToken = configuredResetToken();
  if (!resetToken) {
    return false;
  }

  try {
    const previousVersion = window.localStorage.getItem(LAST_SEEN_APP_VERSION_KEY);
    const nextVersion = currentAppVersion();
    return Boolean(previousVersion && nextVersion && previousVersion !== nextVersion);
  } catch {
    return false;
  }
}

export function rememberCurrentAppVersion() {
  if (typeof window === "undefined") {
    return;
  }

  const appVersion = currentAppVersion();
  if (!appVersion) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_SEEN_APP_VERSION_KEY, appVersion);
  } catch {
    // Best effort only; the app should continue even if local persistence is unavailable.
  }
}

export function applyReleaseStorageReset() {
  if (typeof window === "undefined") {
    return;
  }

  const resetToken = configuredResetToken();
  if (!resetToken) {
    return;
  }

  try {
    const appliedToken = window.localStorage.getItem(RESET_TOKEN_KEY);
    if (appliedToken === resetToken) {
      rememberCurrentAppVersion();
      return;
    }

    FORM_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    removePrefixedStorageKeys(window.localStorage, FORM_STORAGE_PREFIXES);
    window.localStorage.setItem(RESET_TOKEN_KEY, resetToken);
    rememberCurrentAppVersion();
  } catch (error) {
    console.warn("Release storage reset could not be applied.", error);
  }
}
