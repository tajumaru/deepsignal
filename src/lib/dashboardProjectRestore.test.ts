import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDashboardProjectRestoreSnapshot,
  isDashboardBootPending,
  isDashboardWalletRuntimeSettled,
  initializeDashboardProjectRestore,
  markDashboardWalletImportReady,
  markDashboardWalletImportSkipped,
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
    expect(getDashboardProjectRestoreSnapshot().walletRuntime).toBe("mounted");
  });

  it("does not resolve a stored project before wallet restore settles", () => {
    window.localStorage.setItem("deepsignal.projectRegistry.selectedProjectId:test", "0xabc123");

    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportStarted("/dashboard");
    vi.advanceTimersByTime(250);

    expect(getDashboardProjectRestoreSnapshot().state).toBe("restoring");
    expect(getDashboardProjectRestoreSnapshot().currentProjectId).toBe("");

    markDashboardWalletImportReady("/dashboard");
    vi.advanceTimersByTime(50);

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_with_project");
    expect(getDashboardProjectRestoreSnapshot().currentProjectId).toBe("0xabc123");
    expect(getDashboardProjectRestoreSnapshot().source).toBe("namespaced-selected-project");
  });

  it("treats only settled wallet runtime states as safe to restore", () => {
    expect(isDashboardWalletRuntimeSettled("deferred")).toBe(false);
    expect(isDashboardWalletRuntimeSettled("pending")).toBe(false);
    expect(isDashboardWalletRuntimeSettled("mounted")).toBe(true);
    expect(isDashboardWalletRuntimeSettled("failed")).toBe(true);
    expect(isDashboardWalletRuntimeSettled("skipped_no_wallet")).toBe(true);
    expect(isDashboardWalletRuntimeSettled("timeout_fallback")).toBe(true);
  });

  it("keeps dashboard boot pending while provider or restore settling is still in flight", () => {
    initializeDashboardProjectRestore("/dashboard");

    expect(
      isDashboardBootPending(getDashboardProjectRestoreSnapshot(), {
        walletProviderMounted: false,
        walletProviderPending: true,
        walletSessionPhase: "provider_deferred",
      }),
    ).toBe(true);

    markDashboardWalletImportReady("/dashboard");
    vi.advanceTimersByTime(100);

    expect(
      isDashboardBootPending(getDashboardProjectRestoreSnapshot(), {
        walletProviderMounted: true,
        walletProviderPending: false,
        walletSessionPhase: "disconnected",
      }),
    ).toBe(false);
  });

  it("resolves ready_without_project quickly when the wallet is disconnected", () => {
    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportSkipped("/dashboard");

    vi.advanceTimersByTime(250);

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_without_project");
    expect(getDashboardProjectRestoreSnapshot().walletRuntime).toBe("skipped_no_wallet");
    expect(getDashboardProjectRestoreSnapshot().walletSettled).toBe(true);
  });

  it("treats a stored literal null project id as no selected project", () => {
    window.localStorage.setItem("deepsignal.projectRegistry.selectedProjectId:test", "null");

    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportSkipped("/dashboard");

    vi.advanceTimersByTime(250);

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_without_project");
    expect(getDashboardProjectRestoreSnapshot().currentProjectId).toBe("");
    expect(getDashboardProjectRestoreSnapshot().source).toBe("none-confirmed");
  });
});
