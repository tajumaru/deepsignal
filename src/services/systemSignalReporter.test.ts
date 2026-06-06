import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import { reportSystemError } from "./systemSignalReporterClient";
import {
  SYSTEM_SIGNAL_FORM_ID,
  getSystemSignalDiagnostics,
  isSystemSignal,
  shouldAttemptSystemSignalRemoteSync,
} from "./systemSignalReporterHelpers";

describe("systemSignalReporter", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("stores runtime failures as system error submissions", async () => {
    reportSystemError({
      error: new Error("Route module failed"),
      routePath: "/admin",
      routeId: "admin",
      chunkUrl: "https://example.test/assets/AdminDashboardPage.js",
      severity: "critical",
      sourceContext: "test",
      diagnostics: {
        extraProbe: "failed",
      },
    });

    await waitFor(async () => {
      expect(await localStorageAdapter.listSubmissions(SYSTEM_SIGNAL_FORM_ID)).toHaveLength(1);
    });

    const form = await localStorageAdapter.getForm(SYSTEM_SIGNAL_FORM_ID);
    const submissions = await localStorageAdapter.listSubmissions(SYSTEM_SIGNAL_FORM_ID);
    expect(form?.title).toBe("DeepSignal System Alerts");
    expect(submissions).toHaveLength(1);
    expect(isSystemSignal(submissions[0])).toBe(true);
    expect(submissions[0]).toMatchObject({
      kind: "system_error",
      source: "deepsignal-runtime",
      systemSeverity: "critical",
      severity: "critical",
      priority: "high",
      status: "unread",
    });
    expect(submissions[0].answers.diagnostics).toEqual(expect.stringContaining("Route module failed"));
    expect(getSystemSignalDiagnostics(submissions[0])).toMatchObject({
      errorName: "Error",
      errorMessage: "Route module failed",
      routePath: "/admin",
      routeId: "admin",
      chunkUrl: "https://example.test/assets/AdminDashboardPage.js",
      sourceContext: "test",
      extraProbe: "failed",
    });
  });

  it("deduplicates the same error fingerprint inside the throttle window", async () => {
    const error = new Error("Same failing chunk");
    reportSystemError({
      error,
      routePath: "/admin",
      routeId: "admin",
      chunkUrl: "https://example.test/assets/AdminDashboardPage.js",
      severity: "critical",
    });
    reportSystemError({
      error,
      routePath: "/admin",
      routeId: "admin",
      chunkUrl: "https://example.test/assets/AdminDashboardPage.js",
      severity: "critical",
    });

    await waitFor(async () => {
      expect(await localStorageAdapter.listSubmissions(SYSTEM_SIGNAL_FORM_ID)).toHaveLength(1);
    });
  });

  it("only enables no-prompt remote sync for Walrus Tatum storage", () => {
    expect(
      shouldAttemptSystemSignalRemoteSync({
        VITE_STORAGE_MODE: "walrus",
        VITE_WALRUS_STORAGE_MODE: "tatum",
      }),
    ).toBe(true);
    expect(
      shouldAttemptSystemSignalRemoteSync({
        VITE_REQUIRE_WALRUS: "true",
        VITE_WALRUS_STORAGE_MODE: "tatum",
      }),
    ).toBe(true);
    expect(
      shouldAttemptSystemSignalRemoteSync({
        VITE_STORAGE_MODE: "walrus",
        VITE_WALRUS_STORAGE_MODE: "uploadRelay",
      }),
    ).toBe(false);
    expect(
      shouldAttemptSystemSignalRemoteSync({
        VITE_STORAGE_MODE: "local",
        VITE_WALRUS_STORAGE_MODE: "tatum",
      }),
    ).toBe(false);
  });
});
