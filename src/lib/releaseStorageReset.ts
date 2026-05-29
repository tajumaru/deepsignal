import { buildInfo } from "./buildInfo";

const RESET_TOKEN_KEY = "deepsignal.releaseStorageReset.appliedToken";
const LAST_SEEN_APP_VERSION_KEY = "deepsignal.releaseStorageReset.lastSeenAppVersion";

const RELEASE_DIAGNOSTIC_STORAGE_KEYS = ["deepsignal:lastExploreError"];

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

    RELEASE_DIAGNOSTIC_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(RESET_TOKEN_KEY, resetToken);
    rememberCurrentAppVersion();
  } catch (error) {
    console.warn("Release storage reset could not be applied.", error);
  }
}
