import { useEffect, useSyncExternalStore } from "react";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle, setDeepSignalDebugReadiness } from "./routeDiagnostics";

export type ProjectRestoreState = "unknown" | "restoring" | "ready_with_project" | "ready_without_project" | "error";
export type DashboardWalletRuntimeState = "deferred" | "pending" | "ready" | "failed" | "timed_out";

type ProjectRestoreSource =
  | "unknown"
  | "legacy-selected-project"
  | "namespaced-selected-project"
  | "recent-projects"
  | "none-confirmed"
  | "wallet-timeout";

export type DashboardProjectRestoreSnapshot = {
  routePath: string;
  state: ProjectRestoreState;
  currentProjectId: string;
  source: ProjectRestoreSource;
  walletRuntime: DashboardWalletRuntimeState;
  storageSettled: boolean;
  walletSettled: boolean;
  mobileSafari: boolean;
  errorMessage: string | null;
};

type ProjectSelectionSnapshot = {
  currentProjectId: string;
  source: ProjectRestoreSource;
};

const SELECTED_PROJECT_ID_KEY = "deepsignal.projectRegistry.selectedProjectId";
const RECENT_PROJECTS_KEY = "deepsignal.projectRegistry.recentProjects";
const PROJECT_REGISTRY_STORAGE_EVENT = "deepsignal:project-registry-storage";

const listeners = new Set<() => void>();
let cleanupActiveRestore: (() => void) | null = null;
let storageSettledTimer = 0;
let walletTimeoutTimer = 0;
let loggedSourceKey = "";
let snapshot: DashboardProjectRestoreSnapshot = {
  routePath: "",
  state: "unknown",
  currentProjectId: "",
  source: "unknown",
  walletRuntime: "deferred",
  storageSettled: false,
  walletSettled: false,
  mobileSafari: false,
  errorMessage: null,
};

function emit() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(next: Partial<DashboardProjectRestoreSnapshot>) {
  snapshot = {
    ...snapshot,
    ...next,
  };
  setDeepSignalDebugReadiness({
    projectRestoreState: snapshot.state,
    projectRestoreSource: snapshot.source,
    projectRestoreCurrentProjectId: snapshot.currentProjectId || null,
    projectRestoreWalletRuntime: snapshot.walletRuntime,
    projectRestoreStorageSettled: snapshot.storageSettled,
    projectRestoreWalletSettled: snapshot.walletSettled,
    projectRestoreError: snapshot.errorMessage,
  });
  emit();
}

function normalizeObjectId(value?: string | null) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function readNamespacedStorageValue(prefix: string) {
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) {
      continue;
    }
    const value = window.localStorage.getItem(key);
    if (value) {
      return value;
    }
  }
  return "";
}

function readProjectSelectionSnapshot(): ProjectSelectionSnapshot {
  const legacy = normalizeObjectId(window.localStorage.getItem(SELECTED_PROJECT_ID_KEY));
  if (legacy) {
    return {
      currentProjectId: legacy,
      source: "legacy-selected-project",
    };
  }

  const namespaced = normalizeObjectId(readNamespacedStorageValue(`${SELECTED_PROJECT_ID_KEY}:`));
  if (namespaced) {
    return {
      currentProjectId: namespaced,
      source: "namespaced-selected-project",
    };
  }

  const recentProjects = readNamespacedStorageValue(`${RECENT_PROJECTS_KEY}:`);
  if (recentProjects) {
    return {
      currentProjectId: "",
      source: "recent-projects",
    };
  }

  return {
    currentProjectId: "",
    source: "unknown",
  };
}

function logProjectRestoreSource(selection: ProjectSelectionSnapshot) {
  const key = `${selection.source}:${selection.currentProjectId}`;
  if (loggedSourceKey === key) {
    return;
  }
  loggedSourceKey = key;
  logRouteLifecycle("project-restore:source", {
    routePath: snapshot.routePath,
    source: selection.source,
    currentProjectId: selection.currentProjectId || "",
    walletRuntime: snapshot.walletRuntime,
  });
}

function resolveRestoreState(selection: ProjectSelectionSnapshot) {
  if (selection.currentProjectId) {
    logProjectRestoreSource(selection);
    updateSnapshot({
      currentProjectId: selection.currentProjectId,
      errorMessage: null,
      source: selection.source,
      state: "ready_with_project",
    });
    logRouteLifecycle("project-restore:resolved", {
      routePath: snapshot.routePath,
      source: selection.source,
      currentProjectId: selection.currentProjectId,
      state: "ready_with_project",
      walletRuntime: snapshot.walletRuntime,
    });
    return;
  }

  if (!snapshot.storageSettled || !snapshot.walletSettled) {
    updateSnapshot({
      currentProjectId: "",
      source: selection.source,
      state: "restoring",
    });
    return;
  }

  logProjectRestoreSource(selection);
  updateSnapshot({
    currentProjectId: "",
    errorMessage: null,
    source: selection.source === "unknown" ? "none-confirmed" : selection.source,
    state: "ready_without_project",
  });
  logRouteLifecycle("project-restore:none-confirmed", {
    routePath: snapshot.routePath,
    source: selection.source,
    walletRuntime: snapshot.walletRuntime,
  });
  logRouteLifecycle("project-restore:resolved", {
    routePath: snapshot.routePath,
    source: selection.source === "unknown" ? "none-confirmed" : selection.source,
    currentProjectId: "",
    state: "ready_without_project",
    walletRuntime: snapshot.walletRuntime,
  });
}

function refreshProjectRestore() {
  try {
    const selection = readProjectSelectionSnapshot();
    resolveRestoreState(selection);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateSnapshot({
      currentProjectId: "",
      errorMessage,
      source: "unknown",
      state: "error",
    });
  }
}

function clearRestoreTimers() {
  window.clearTimeout(storageSettledTimer);
  window.clearTimeout(walletTimeoutTimer);
  storageSettledTimer = 0;
  walletTimeoutTimer = 0;
}

function getWalletSettleTimeoutMs(mobileSafari: boolean) {
  return mobileSafari ? 12_000 : 8_000;
}

export function initializeDashboardProjectRestore(routePath: string) {
  const mobileSafari = Boolean(getBrowserCapabilitiesSnapshot().mobileSafari);
  cleanupActiveRestore?.();
  clearRestoreTimers();
  loggedSourceKey = "";

  snapshot = {
    routePath,
    state: "restoring",
    currentProjectId: "",
    source: "unknown",
    walletRuntime: "deferred",
    storageSettled: false,
    walletSettled: false,
    mobileSafari,
    errorMessage: null,
  };
  setDeepSignalDebugReadiness({
    workspaceReady: false,
  });
  emit();
  logRouteLifecycle("project-restore:start", {
    routePath,
    walletRuntime: "deferred",
    mobileSafari,
  });

  const handleStorageChange = () => {
    refreshProjectRestore();
  };

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(PROJECT_REGISTRY_STORAGE_EVENT, handleStorageChange);

  storageSettledTimer = window.setTimeout(() => {
    updateSnapshot({ storageSettled: true });
    refreshProjectRestore();
  }, mobileSafari ? 220 : 80);

  walletTimeoutTimer = window.setTimeout(() => {
    updateSnapshot({
      walletRuntime: snapshot.walletRuntime === "ready" ? "ready" : "timed_out",
      walletSettled: true,
    });
    logRouteLifecycle("project-restore:source", {
      routePath,
      source: "wallet-timeout",
      currentProjectId: snapshot.currentProjectId || "",
      walletRuntime: "timed_out",
    });
    refreshProjectRestore();
  }, getWalletSettleTimeoutMs(mobileSafari));

  refreshProjectRestore();

  cleanupActiveRestore = () => {
    clearRestoreTimers();
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(PROJECT_REGISTRY_STORAGE_EVENT, handleStorageChange);
  };
  return cleanupActiveRestore;
}

export function resetDashboardProjectRestore() {
  cleanupActiveRestore?.();
  cleanupActiveRestore = null;
  clearRestoreTimers();
  loggedSourceKey = "";
  snapshot = {
    routePath: "",
    state: "unknown",
    currentProjectId: "",
    source: "unknown",
    walletRuntime: "deferred",
    storageSettled: false,
    walletSettled: false,
    mobileSafari: false,
    errorMessage: null,
  };
  emit();
}

export function markDashboardWalletImportStarted(routePath: string) {
  updateSnapshot({
    routePath,
    state: snapshot.state === "unknown" ? "restoring" : snapshot.state,
    walletRuntime: "pending",
    walletSettled: false,
  });
  refreshProjectRestore();
}

export function markDashboardWalletImportReady(routePath: string) {
  updateSnapshot({
    routePath,
    walletRuntime: "ready",
    walletSettled: true,
  });
  refreshProjectRestore();
}

export function markDashboardWalletImportFailed(routePath: string, errorMessage?: string) {
  updateSnapshot({
    routePath,
    errorMessage: errorMessage ?? snapshot.errorMessage,
    walletRuntime: "failed",
    walletSettled: true,
  });
  refreshProjectRestore();
}

export function getDashboardProjectRestoreSnapshot() {
  return snapshot;
}

export function subscribeDashboardProjectRestore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDashboardProjectRestore(routePath: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return undefined;
    }
    return initializeDashboardProjectRestore(routePath);
  }, [enabled, routePath]);

  return useSyncExternalStore(subscribeDashboardProjectRestore, getDashboardProjectRestoreSnapshot, getDashboardProjectRestoreSnapshot);
}

export function useDashboardProjectRestoreSnapshot() {
  return useSyncExternalStore(subscribeDashboardProjectRestore, getDashboardProjectRestoreSnapshot, getDashboardProjectRestoreSnapshot);
}

export function isDashboardWorkspaceReady(restoreSnapshot: DashboardProjectRestoreSnapshot) {
  return restoreSnapshot.state === "ready_with_project" || restoreSnapshot.state === "ready_without_project";
}
