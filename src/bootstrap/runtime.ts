import { startBuildUpdateCheck } from "../lib/buildUpdate";
import { scheduleIdleTask, type IdleTaskCleanup } from "../lib/scheduleIdleTask";
import {
  applyReleaseStorageReset,
  rememberCurrentAppVersion,
  shouldApplyReleaseStorageResetOnVersionMismatch,
} from "../lib/releaseStorageReset";

const buildUpdateIdleFallbackMs = 8000;
const releaseStorageResetDelayMs = 12000;

type Cleanup = IdleTaskCleanup;

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
