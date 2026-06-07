import { useSyncExternalStore } from "react";

export type RouteImportPhase = "idle" | "importing" | "css_recovering" | "css_failed";

export type RouteRecoverySnapshot = {
  cssAssetError: string | null;
  failedChunkUrl: string | null;
  pagehideCount: number;
  pageshowCount: number;
  pendingLabels: string[];
  phase: RouteImportPhase;
  visibilityState: DocumentVisibilityState | "hidden";
};

type RouteRecoveryState = RouteRecoverySnapshot & {
  cssRecoveryUrls: Set<string>;
};

const listeners = new Set<() => void>();
const pageCounters = {
  listening: false,
  pagehideCount: 0,
  pageshowCount: 0,
};

const state: RouteRecoveryState = {
  cssAssetError: null,
  cssRecoveryUrls: new Set<string>(),
  failedChunkUrl: null,
  pagehideCount: 0,
  pageshowCount: 0,
  pendingLabels: [],
  phase: "idle",
  visibilityState: "hidden",
};
let snapshot: RouteRecoverySnapshot = {
  cssAssetError: state.cssAssetError,
  failedChunkUrl: state.failedChunkUrl,
  pagehideCount: state.pagehideCount,
  pageshowCount: state.pageshowCount,
  pendingLabels: state.pendingLabels,
  phase: state.phase,
  visibilityState: state.visibilityState,
};

function emit() {
  listeners.forEach((listener) => listener());
}

function snapshotsEqual(left: RouteRecoverySnapshot, right: RouteRecoverySnapshot) {
  return (
    left.cssAssetError === right.cssAssetError &&
    left.failedChunkUrl === right.failedChunkUrl &&
    left.pagehideCount === right.pagehideCount &&
    left.pageshowCount === right.pageshowCount &&
    left.phase === right.phase &&
    left.visibilityState === right.visibilityState &&
    left.pendingLabels.length === right.pendingLabels.length &&
    left.pendingLabels.every((label, index) => label === right.pendingLabels[index])
  );
}

function syncSnapshot() {
  const nextSnapshot: RouteRecoverySnapshot = {
    cssAssetError: state.cssAssetError,
    failedChunkUrl: state.failedChunkUrl,
    pagehideCount: state.pagehideCount,
    pageshowCount: state.pageshowCount,
    pendingLabels: state.pendingLabels,
    phase: state.phase,
    visibilityState: state.visibilityState,
  };

  if (snapshotsEqual(snapshot, nextSnapshot)) {
    return false;
  }

  snapshot = nextSnapshot;
  return true;
}

function ensurePageLifecycleTracking() {
  if (typeof window === "undefined" || pageCounters.listening) {
    return;
  }
  pageCounters.listening = true;
  state.visibilityState = document.visibilityState;
  window.addEventListener("pagehide", () => {
    pageCounters.pagehideCount += 1;
    state.pagehideCount = pageCounters.pagehideCount;
    if (syncSnapshot()) {
      emit();
    }
  });
  window.addEventListener("pageshow", () => {
    pageCounters.pageshowCount += 1;
    state.pageshowCount = pageCounters.pageshowCount;
    if (syncSnapshot()) {
      emit();
    }
  });
  document.addEventListener("visibilitychange", () => {
    state.visibilityState = document.visibilityState;
    if (syncSnapshot()) {
      emit();
    }
  });
}

function syncPhase() {
  if (state.cssAssetError) {
    state.phase = state.cssRecoveryUrls.size > 0 ? "css_recovering" : "css_failed";
    return;
  }
  state.phase = state.pendingLabels.length > 0 ? "importing" : "idle";
}

export function markRouteImportStart(label: string) {
  ensurePageLifecycleTracking();
  if (!state.pendingLabels.includes(label)) {
    state.pendingLabels = [...state.pendingLabels, label];
  }
  syncPhase();
  if (syncSnapshot()) {
    emit();
  }
}

export function markRouteImportSettled(label: string) {
  state.pendingLabels = state.pendingLabels.filter((entry) => entry !== label);
  syncPhase();
  if (syncSnapshot()) {
    emit();
  }
}

export function markRouteImportFailure(chunkUrl: string | null) {
  state.failedChunkUrl = chunkUrl;
  if (syncSnapshot()) {
    emit();
  }
}

export function markCssRecoveryStart(url: string) {
  ensurePageLifecycleTracking();
  state.cssRecoveryUrls.add(url);
  state.cssAssetError = url;
  syncPhase();
  if (syncSnapshot()) {
    emit();
  }
}

export function markCssRecoveryResolved(url: string) {
  state.cssRecoveryUrls.delete(url);
  if (state.cssAssetError === url) {
    state.cssAssetError = null;
  }
  syncPhase();
  if (syncSnapshot()) {
    emit();
  }
}

export function markCssRecoveryFailed(url: string) {
  state.cssRecoveryUrls.delete(url);
  state.cssAssetError = url;
  syncPhase();
  if (syncSnapshot()) {
    emit();
  }
}

export function getRouteRecoverySnapshot(): RouteRecoverySnapshot {
  ensurePageLifecycleTracking();
  syncSnapshot();
  return snapshot;
}

export function subscribeRouteRecovery(listener: () => void) {
  ensurePageLifecycleTracking();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRouteRecoveryState() {
  return useSyncExternalStore(subscribeRouteRecovery, getRouteRecoverySnapshot, getRouteRecoverySnapshot);
}
