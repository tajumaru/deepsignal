import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDashboardProjectRestoreSnapshot,
  initializeDashboardProjectRestore,
  markDashboardWalletImportReady,
  markDashboardWalletImportStarted,
  resetDashboardProjectRestore,
} from "./dashboardProjectRestore";

describe("dashboardProjectRestore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.__DEEPSIGNAL_DEBUG__ = undefined;
  });

  afterEach(() => {
    resetDashboardProjectRestore();
    vi.useRealTimers();
    window.localStorage.clear();
    window.__DEEPSIGNAL_DEBUG__ = undefined;
  });

  it("keeps restore pending until wallet restore settles when no project is confirmed", () => {
    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportStarted("/dashboard");

    vi.advanceTimersByTime(500);

    expect(getDashboardProjectRestoreSnapshot().state).toBe("restoring");

    markDashboardWalletImportReady("/dashboard");
    vi.advanceTimersByTime(100);

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_without_project");
    expect(getDashboardProjectRestoreSnapshot().walletRuntime).toBe("ready");
  });

  it("resolves with a project from namespaced storage before wallet restore completes", () => {
    window.localStorage.setItem("deepsignal.projectRegistry.selectedProjectId:test", "0xabc123");

    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportStarted("/dashboard");
    vi.advanceTimersByTime(250);

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_with_project");
    expect(getDashboardProjectRestoreSnapshot().currentProjectId).toBe("0xabc123");
    expect(getDashboardProjectRestoreSnapshot().source).toBe("namespaced-selected-project");
  });
});
