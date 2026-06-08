import { useEffect, useSyncExternalStore } from "react";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle, setDeepSignalDebugReadiness } from "./routeDiagnostics";

export type ProjectRestoreState =
  | "unknown"
  | "restoring"
  | "ready_with_project"
  | "ready_without_project"
  | "blocked_wallet_required"
  | "error";
export type DashboardWalletRuntimeState =
  | "deferred"
  | "pending"
  | "mounted"
  | "failed"
  | "skipped_no_wallet"
  | "timeout_fallback";

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

type DashboardBootPendingOptions = {
  walletProviderMounted?: boolean;
  walletProviderPending?: boolean;
  walletSessionPhase?: "provider_deferred" | "restoring" | "disconnected" | "connected";
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
  const nextSnapshot = {
    ...snapshot,
    ...next,
  };
  if (
    nextSnapshot.routePath === snapshot.routePath &&
    nextSnapshot.state === snapshot.state &&
    nextSnapshot.currentProjectId === snapshot.currentProjectId &&
    nextSnapshot.source === snapshot.source &&
    nextSnapshot.walletRuntime === snapshot.walletRuntime &&
    nextSnapshot.storageSettled === snapshot.storageSettled &&
    nextSnapshot.walletSettled === snapshot.walletSettled &&
    nextSnapshot.mobileSafari === snapshot.mobileSafari &&
    nextSnapshot.errorMessage === snapshot.errorMessage
  ) {
    return;
  }
  snapshot = nextSnapshot;
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
  if (trimmed === "null" || trimmed === "undefined") {
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

function readRecentProjectSelection(): ProjectSelectionSnapshot {
  const rawRecentProjects = readNamespacedStorageValue(`${RECENT_PROJECTS_KEY}:`);
  if (!rawRecentProjects) {
    return {
      currentProjectId: "",
      source: "unknown",
    };
  }

  try {
    const parsed = JSON.parse(rawRecentProjects) as Array<{ objectId?: unknown }> | null;
    const currentProjectId = Array.isArray(parsed)
      ? normalizeObjectId(
          parsed.find((project) => project && typeof project === "object" && "objectId" in project)?.objectId as
            | string
            | null
            | undefined,
        )
      : "";
    return {
      currentProjectId,
      source: "recent-projects",
    };
  } catch {
    return {
      currentProjectId: "",
      source: "recent-projects",
    };
  }
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

  return readRecentProjectSelection();
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
  if (!snapshot.storageSettled) {
    updateSnapshot({
      currentProjectId: "",
      source: selection.source,
      state: "restoring",
    });
    return;
  }

  if (selection.currentProjectId) {
    if (
      snapshot.state === "ready_with_project" &&
      snapshot.currentProjectId === selection.currentProjectId &&
      snapshot.source === selection.source &&
      snapshot.errorMessage === null
    ) {
      return;
    }
    logProjectRestoreSource(selection);
    updateSnapshot({
      currentProjectId: selection.currentProjectId,
      errorMessage: null,
      source: selection.source,
      state: "ready_with_project",
    });
    logRouteLifecycle("project-restore-complete", {
      currentProjectId: selection.currentProjectId,
      routePath: snapshot.routePath,
      source: selection.source,
      state: "ready_with_project",
      walletRuntime: snapshot.walletRuntime,
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

  const resolvedSource = selection.source === "unknown" ? "none-confirmed" : selection.source;
  if (
    snapshot.state === "ready_without_project" &&
    snapshot.currentProjectId === "" &&
    snapshot.source === resolvedSource &&
    snapshot.errorMessage === null
  ) {
    return;
  }
  logProjectRestoreSource(selection);
  updateSnapshot({
    currentProjectId: "",
    errorMessage: null,
    source: resolvedSource,
    state: "ready_without_project",
  });
  logRouteLifecycle("project-restore-complete", {
    currentProjectId: "",
    routePath: snapshot.routePath,
    source: resolvedSource,
    state: "ready_without_project",
    walletRuntime: snapshot.walletRuntime,
  });
  logRouteLifecycle("project-restore:none-confirmed", {
    routePath: snapshot.routePath,
    source: selection.source,
    walletRuntime: snapshot.walletRuntime,
  });
  logRouteLifecycle("project-restore:resolved", {
    routePath: snapshot.routePath,
    source: resolvedSource,
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

function clearWalletTimeoutTimer() {
  window.clearTimeout(walletTimeoutTimer);
  walletTimeoutTimer = 0;
}

function getWalletSettleTimeoutMs(mobileSafari: boolean) {
  return mobileSafari ? 12_000 : 8_000;
}

export function initializeDashboardProjectRestore(routePath: string) {
  const mobileSafari = Boolean(getBrowserCapabilitiesSnapshot().mobileSafari);
  const walletRuntime = snapshot.walletRuntime;
  const walletSettled = isDashboardWalletRuntimeSettled(walletRuntime);
  cleanupActiveRestore?.();
  clearRestoreTimers();
  loggedSourceKey = "";

  snapshot = {
    routePath,
    state: "restoring",
    currentProjectId: "",
    source: "unknown",
    walletRuntime,
    storageSettled: true,
    walletSettled,
    mobileSafari,
    errorMessage: null,
  };
  setDeepSignalDebugReadiness({
    workspaceReady: false,
  });
  emit();
  logRouteLifecycle("project-restore-start", {
    routePath,
    walletRuntime,
    mobileSafari,
  });
  logRouteLifecycle("project-restore:start", {
    routePath,
    walletRuntime,
    mobileSafari,
  });

  const handleStorageChange = () => {
    refreshProjectRestore();
  };

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(PROJECT_REGISTRY_STORAGE_EVENT, handleStorageChange);

  walletTimeoutTimer = window.setTimeout(() => {
    if (snapshot.walletSettled) {
      return;
    }
    updateSnapshot({
      walletRuntime: snapshot.walletRuntime === "mounted" ? "mounted" : "timeout_fallback",
      walletSettled: true,
    });
    logRouteLifecycle("project-restore:source", {
      routePath,
      source: "wallet-timeout",
      currentProjectId: snapshot.currentProjectId || "",
      walletRuntime: "timeout_fallback",
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

export function markDashboardProjectRestoreBlockedWalletRequired(routePath: string) {
  cleanupActiveRestore?.();
  cleanupActiveRestore = null;
  clearRestoreTimers();
  loggedSourceKey = "";
  updateSnapshot({
    routePath,
    state: "blocked_wallet_required",
    currentProjectId: "",
    source: "unknown",
    walletRuntime: "skipped_no_wallet",
    storageSettled: false,
    walletSettled: true,
    errorMessage: null,
  });
}

export function markDashboardWalletImportStarted(routePath: string) {
  if (
    snapshot.routePath === routePath &&
    snapshot.walletSettled &&
    (snapshot.state === "ready_without_project" || snapshot.state === "ready_with_project")
  ) {
    return;
  }
  updateSnapshot({
    routePath,
    state: snapshot.state === "unknown" ? "restoring" : snapshot.state,
    walletRuntime: "pending",
    walletSettled: false,
  });
  refreshProjectRestore();
}

export function markDashboardWalletImportReady(routePath: string) {
  clearWalletTimeoutTimer();
  updateSnapshot({
    routePath,
    walletRuntime: "mounted",
    walletSettled: true,
  });
  refreshProjectRestore();
}

export function markDashboardWalletImportFailed(routePath: string, errorMessage?: string) {
  clearWalletTimeoutTimer();
  updateSnapshot({
    routePath,
    errorMessage: errorMessage ?? snapshot.errorMessage,
    walletRuntime: "failed",
    walletSettled: true,
  });
  refreshProjectRestore();
}

export function markDashboardWalletImportSkipped(routePath: string) {
  clearWalletTimeoutTimer();
  updateSnapshot({
    routePath,
    walletRuntime: "skipped_no_wallet",
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

export function useDashboardProjectRestore(routePath: string, enabled: boolean, blockedWalletRequired = false) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    if (!enabled) {
      if (blockedWalletRequired && (routePath === "/dashboard" || routePath.startsWith("/dashboard?"))) {
        markDashboardProjectRestoreBlockedWalletRequired(routePath);
      } else {
        resetDashboardProjectRestore();
      }
      return undefined;
    }
    return initializeDashboardProjectRestore(routePath);
  }, [blockedWalletRequired, enabled, routePath]);

  return useSyncExternalStore(subscribeDashboardProjectRestore, getDashboardProjectRestoreSnapshot, getDashboardProjectRestoreSnapshot);
}

export function useDashboardProjectRestoreSnapshot() {
  return useSyncExternalStore(subscribeDashboardProjectRestore, getDashboardProjectRestoreSnapshot, getDashboardProjectRestoreSnapshot);
}

export function isDashboardWalletRuntimeSettled(walletRuntime: DashboardWalletRuntimeState) {
  return (
    walletRuntime === "mounted" ||
    walletRuntime === "failed" ||
    walletRuntime === "skipped_no_wallet" ||
    walletRuntime === "timeout_fallback"
  );
}

export function isDashboardWorkspaceReady(restoreSnapshot: DashboardProjectRestoreSnapshot) {
  return restoreSnapshot.state === "ready_with_project" || restoreSnapshot.state === "ready_without_project";
}

export function isDashboardBootPending(
  restoreSnapshot: DashboardProjectRestoreSnapshot,
  _options?: DashboardBootPendingOptions,
) {
  void _options;
  return (
    restoreSnapshot.state === "unknown" ||
    restoreSnapshot.state === "restoring" ||
    !restoreSnapshot.storageSettled
  );
}
