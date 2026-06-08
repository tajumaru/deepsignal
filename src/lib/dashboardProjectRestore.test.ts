import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDashboardProjectRestoreSnapshot,
  isDashboardBootPending,
  isDashboardWalletRuntimeSettled,
  initializeDashboardProjectRestore,
  markDashboardProjectRestoreBlockedWalletRequired,
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
    window.__DEEPSIGNAL_ROUTE_EVENTS__ = [];
  });

  afterEach(() => {
    resetDashboardProjectRestore();
    vi.useRealTimers();
    window.localStorage.clear();
    window.__DEEPSIGNAL_DEBUG__ = undefined;
    window.__DEEPSIGNAL_ROUTE_EVENTS__ = [];
  });

  it("resolves ready_without_project immediately from local state before wallet restore settles", () => {
    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportStarted("/dashboard");

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_without_project");
    expect(isDashboardBootPending(getDashboardProjectRestoreSnapshot())).toBe(false);

    markDashboardWalletImportReady("/dashboard");

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_without_project");
    expect(getDashboardProjectRestoreSnapshot().walletRuntime).toBe("mounted");
  });

  it("resolves a stored project immediately from local storage before wallet restore settles", () => {
    window.localStorage.setItem("deepsignal.projectRegistry.selectedProjectId:test", "0xabc123");

    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportStarted("/dashboard");

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_with_project");
    expect(getDashboardProjectRestoreSnapshot().currentProjectId).toBe("0xabc123");

    markDashboardWalletImportReady("/dashboard");

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

  it("ignores provider and wallet phase while local restore is ready", () => {
    initializeDashboardProjectRestore("/dashboard");

    expect(
      isDashboardBootPending(getDashboardProjectRestoreSnapshot(), {
        walletProviderMounted: false,
        walletProviderPending: true,
        walletSessionPhase: "provider_deferred",
      }),
    ).toBe(false);
  });

  it("resolves ready_without_project quickly when the wallet is disconnected", () => {
    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportSkipped("/dashboard");

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_without_project");
    expect(getDashboardProjectRestoreSnapshot().walletRuntime).toBe("skipped_no_wallet");
    expect(getDashboardProjectRestoreSnapshot().walletSettled).toBe(true);
  });

  it("does not regress to wallet-timeout after disconnected restore is already ready", () => {
    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportSkipped("/dashboard");

    markDashboardWalletImportStarted("/dashboard");
    vi.advanceTimersByTime(12_500);

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_without_project");
    expect(getDashboardProjectRestoreSnapshot().walletRuntime).toBe("skipped_no_wallet");

    const routeEvents = window.__DEEPSIGNAL_ROUTE_EVENTS__ ?? [];
    expect(routeEvents.filter((entry) => entry.event === "project-restore:resolved")).toHaveLength(1);
    expect(
      routeEvents.some(
        (entry) =>
          entry.event === "project-restore:source" &&
          (entry.details?.source === "wallet-timeout" || entry.details?.walletRuntime === "timeout_fallback"),
      ),
    ).toBe(false);
  });

  it("treats a stored literal null project id as no selected project", () => {
    window.localStorage.setItem("deepsignal.projectRegistry.selectedProjectId:test", "null");

    initializeDashboardProjectRestore("/dashboard");
    markDashboardWalletImportSkipped("/dashboard");

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_without_project");
    expect(getDashboardProjectRestoreSnapshot().currentProjectId).toBe("");
    expect(getDashboardProjectRestoreSnapshot().source).toBe("none-confirmed");
  });

  it("falls back to the most recent project when no selected project id is stored", () => {
    window.localStorage.setItem(
      "deepsignal.projectRegistry.recentProjects:test",
      JSON.stringify([
        { objectId: "0xbeef", name: "Latest project" },
        { objectId: "0xabc123", name: "Older project" },
      ]),
    );

    initializeDashboardProjectRestore("/dashboard");

    expect(getDashboardProjectRestoreSnapshot().state).toBe("ready_with_project");
    expect(getDashboardProjectRestoreSnapshot().currentProjectId).toBe("0xbeef");
    expect(getDashboardProjectRestoreSnapshot().source).toBe("recent-projects");
  });

  it("can block dashboard restore without reading a selected project while the wallet is disconnected", () => {
    window.localStorage.setItem("deepsignal.projectRegistry.selectedProjectId:test", "0xabc123");

    markDashboardProjectRestoreBlockedWalletRequired("/dashboard");

    expect(getDashboardProjectRestoreSnapshot().state).toBe("blocked_wallet_required");
    expect(getDashboardProjectRestoreSnapshot().currentProjectId).toBe("");
    expect(getDashboardProjectRestoreSnapshot().walletRuntime).toBe("skipped_no_wallet");
  });
});
