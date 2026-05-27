import { buildInfo } from "./buildInfo";

const reloadStorageKey = "deepsignal.chunkLoadRecovery";
const recoveryWindowMs = 2 * 60 * 1000;
const maxReloadsPerWindow = 4;
const reloadDelayMs = 350;

type ReloadState = {
  startedAt: number;
  count: number;
  buildId?: string;
};

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

let reloadScheduled = false;

function currentBuildId() {
  return [buildInfo.appVersion, buildInfo.buildTime, buildInfo.gitHash].filter(Boolean).join("|");
}

function readReloadState(now: number): ReloadState {
  try {
    const raw = window.sessionStorage.getItem(reloadStorageKey);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReloadState>) : null;
    if (
      parsed &&
      typeof parsed.startedAt === "number" &&
      typeof parsed.count === "number" &&
      parsed.buildId === currentBuildId() &&
      now - parsed.startedAt < recoveryWindowMs
    ) {
      return { startedAt: parsed.startedAt, count: parsed.count, buildId: parsed.buildId };
    }
  } catch {
    // Best effort only; the reload guard should never block normal app startup.
  }

  return { startedAt: now, count: 0, buildId: currentBuildId() };
}

function rememberReloadState(state: ReloadState) {
  try {
    window.sessionStorage.setItem(reloadStorageKey, JSON.stringify(state));
  } catch {
    // If storage is unavailable, still try to recover from the failed chunk.
  }
}

function errorText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }
  return String(error ?? "").toLowerCase();
}

export function isChunkLoadFailure(error: unknown) {
  const text = errorText(error);
  return (
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("importing a module script failed") ||
    text.includes("error loading dynamically imported module") ||
    text.includes("unable to preload css") ||
    text.includes("vite:preloaderror")
  );
}

export function getChunkFailureUrl(error: unknown) {
  const source = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error ?? "");
  return source.match(/https?:\/\/[^\s)'"]+/)?.[0] ?? source.match(/\.\/assets\/[^\s)'"]+/)?.[0] ?? null;
}

export function clearChunkLoadRecoveryState() {
  try {
    window.sessionStorage.removeItem(reloadStorageKey);
  } catch {
    // Best effort only.
  }
  reloadScheduled = false;
}

export async function clearRuntimeCaches() {
  try {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.filter((key) => key.toLowerCase().includes("deepsignal")).map((key) => window.caches.delete(key)));
    }
  } catch {
    // Cache cleanup is best effort; the cache-busted reload below is the important recovery path.
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => {
            const scope = registration.scope.toLowerCase();
            return scope.includes("deepsignal") || scope.includes(window.location.host.toLowerCase());
          })
          .map((registration) => registration.unregister()),
      );
    }
  } catch {
    // Service worker cleanup is best effort and should never block recovery.
  }
}

export function recoverFromChunkLoadFailure(error: unknown) {
  if (typeof window === "undefined" || reloadScheduled || !isChunkLoadFailure(error)) {
    return false;
  }

  const now = Date.now();
  const state = readReloadState(now);
  if (state.count >= maxReloadsPerWindow) {
    console.warn("DeepSignal chunk load recovery limit reached.", error);
    return false;
  }

  reloadScheduled = true;
  rememberReloadState({ startedAt: state.startedAt, count: state.count + 1, buildId: currentBuildId() });
  console.warn("DeepSignal chunk load failed; reloading with a fresh request.", error);

  window.setTimeout(() => {
    void clearRuntimeCaches().finally(() => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("chunk-retry", String(Date.now()));
      nextUrl.searchParams.set("build", buildInfo.appVersion);
      window.location.replace(nextUrl.toString());
    });
  }, reloadDelayMs);

  return true;
}

export function startChunkLoadRecovery() {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleVitePreloadError = (event: VitePreloadErrorEvent) => {
    if (recoverFromChunkLoadFailure(event.payload ?? "vite:preloaderror")) {
      event.preventDefault();
    }
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (recoverFromChunkLoadFailure(event.reason)) {
      event.preventDefault();
    }
  };

  const handleError = (event: ErrorEvent) => {
    recoverFromChunkLoadFailure(event.error ?? event.message);
  };

  window.addEventListener("vite:preloadError", handleVitePreloadError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  window.addEventListener("error", handleError);

  return () => {
    window.removeEventListener("vite:preloadError", handleVitePreloadError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("error", handleError);
  };
}
