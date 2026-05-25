const reloadStorageKey = "deepsignal.chunkLoadRecovery";
const recoveryWindowMs = 2 * 60 * 1000;
const maxReloadsPerWindow = 2;
const reloadDelayMs = 350;

type ReloadState = {
  startedAt: number;
  count: number;
};

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

let reloadScheduled = false;

function readReloadState(now: number): ReloadState {
  try {
    const raw = window.sessionStorage.getItem(reloadStorageKey);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReloadState>) : null;
    if (
      parsed &&
      typeof parsed.startedAt === "number" &&
      typeof parsed.count === "number" &&
      now - parsed.startedAt < recoveryWindowMs
    ) {
      return { startedAt: parsed.startedAt, count: parsed.count };
    }
  } catch {
    // Best effort only; the reload guard should never block normal app startup.
  }

  return { startedAt: now, count: 0 };
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
  rememberReloadState({ startedAt: state.startedAt, count: state.count + 1 });
  console.warn("DeepSignal chunk load failed; reloading with a fresh request.", error);

  window.setTimeout(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("chunk-retry", String(Date.now()));
    window.location.replace(nextUrl.toString());
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
