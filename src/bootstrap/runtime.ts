import { startBuildUpdateCheck } from "../lib/buildUpdate";
import {
  applyReleaseStorageReset,
  rememberCurrentAppVersion,
  shouldApplyReleaseStorageResetOnVersionMismatch,
} from "../lib/releaseStorageReset";

const buildUpdateIdleFallbackMs = 8000;
const releaseStorageResetDelayMs = 12000;

type Cleanup = () => void;

function scheduleIdleTask(task: () => void, fallbackDelayMs: number): Cleanup {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let completed = false;
  let idleHandle: number | undefined;

  const runTask = () => {
    if (completed) {
      return;
    }
    completed = true;

    if (idleHandle !== undefined && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== undefined) {
      window.clearTimeout(timeoutHandle);
    }

    task();
  };

  if ("requestIdleCallback" in window) {
    idleHandle = window.requestIdleCallback(() => runTask());
  }
  const timeoutHandle = window.setTimeout(runTask, fallbackDelayMs);
  return () => {
    completed = true;
    if (idleHandle !== undefined && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== undefined) {
      window.clearTimeout(timeoutHandle);
    }
  };
}

function startIdleMaintenance(): Cleanup {
  const stopBuildUpdateCheck = scheduleIdleTask(() => {
    startBuildUpdateCheck();
  }, buildUpdateIdleFallbackMs);

  const shouldResetStorage = shouldApplyReleaseStorageResetOnVersionMismatch();
  const releaseResetTimer = window.setTimeout(() => {
    if (shouldResetStorage) {
      applyReleaseStorageReset();
      return;
    }

    rememberCurrentAppVersion();
  }, releaseStorageResetDelayMs);

  return () => {
    stopBuildUpdateCheck();
    window.clearTimeout(releaseResetTimer);
  };
}

export function startRuntimeBootstrap() {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  // critical startup stays in main.tsx
  // recovery stays in main.tsx
  // idle maintenance is deferred until after the initial render path completes
  return startIdleMaintenance();
}
