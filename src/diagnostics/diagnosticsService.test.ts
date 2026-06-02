import { beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_SIGNAL_FORM_ID } from "../services/systemSignalReporter";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { Submission } from "../types";
import { exportDiagnosticsJson } from "./diagnosticsExport";
import { getDiagnostic, listDiagnostics, searchDiagnostics } from "./diagnosticsService";
import { summarizeDiagnostics } from "./diagnosticsSummary";

function createSubmission(id: string, overrides: Partial<Submission> = {}): Submission {
  return {
    id,
    formId: SYSTEM_SIGNAL_FORM_ID,
    kind: "system_error",
    source: "deepsignal-runtime",
    systemSeverity: "error",
    answers: {
      diagnostics: "raw diagnostic payload",
      privateAnswer: "answer-secret",
    },
    attachments: [],
    publicPayload: {
      answers: {
        hidden: "public-answer-secret",
      },
    },
    respondentMeta: {
      chain: "sui",
      isAnonymous: true,
      sessionId: "session-secret",
      submittedAt: "2026-01-01T00:00:00.000Z",
    },
    metadata: {
      systemDiagnostics: {
        severity: "error",
        fingerprint: "fp-shared",
        errorName: "ChunkLoadError",
        errorMessage: "Chunk failed",
        errorStack: "Error stack with session-secret",
        routePath: "/admin?token=abc#frag",
        routeId: "admin",
        chunkUrl: "https://example.test/assets/admin.js?token=abc#frag",
        buildVersion: "0.12.20",
      },
    },
    responderSignature: "signature-secret",
    responderSignedBytes: "signed-bytes-secret",
    encryptedPayload: "encrypted-secret",
    status: "unread",
    priority: "high",
    triageStatus: "new",
    tags: ["system"],
    notes: "",
    isEncrypted: false,
    severity: "error",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    remoteSyncStatus: "local_only",
    ...overrides,
  };
}

describe("diagnostics service", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lists only redacted system diagnostics", async () => {
    await localStorageAdapter.saveSubmission(createSubmission("system-1"));
    await localStorageAdapter.saveSubmission(createSubmission("normal-1", {
      formId: "form-1",
      kind: undefined,
      source: undefined,
      metadata: {},
    }));

    const result = await listDiagnostics();

    expect(result.total).toBe(1);
    expect(result.diagnostics[0]).toMatchObject({
      id: "system-1",
      routePath: "/admin",
      chunkUrl: "https://example.test/assets/admin.js",
    });
    expect(JSON.stringify(result)).not.toContain("answer-secret");
  });

  it("gets one diagnostic with a capped sanitized stack trace", async () => {
    await localStorageAdapter.saveSubmission(createSubmission("system-1"));

    const diagnostic = await getDiagnostic("system-1");

    expect(diagnostic?.errorStack).toBe("Error stack with [redacted]");
    expect(diagnostic?.routePath).toBe("/admin");
  });

  it("searches by route, build version, error name, severity, and fingerprint", async () => {
    await localStorageAdapter.saveSubmission(createSubmission("system-1"));
    await localStorageAdapter.saveSubmission(createSubmission("system-2", {
      systemSeverity: "critical",
      metadata: {
        systemDiagnostics: {
          severity: "critical",
          fingerprint: "fp-explore",
          errorName: "WindowError",
          errorMessage: "Explore failed",
          routePath: "/explore?debug=true",
          routeId: "explore",
          buildVersion: "0.12.21",
        },
      },
      createdAt: "2026-01-02T00:00:00.000Z",
    }));

    await expect(searchDiagnostics({ routeId: "explore" })).resolves.toMatchObject({ total: 1 });
    await expect(searchDiagnostics({ buildVersion: "0.12.20" })).resolves.toMatchObject({ total: 1 });
    await expect(searchDiagnostics({ errorName: "WindowError" })).resolves.toMatchObject({ total: 1 });
    await expect(searchDiagnostics({ severity: "critical" })).resolves.toMatchObject({ total: 1 });
    await expect(searchDiagnostics({ fingerprint: "fp-shared" })).resolves.toMatchObject({ total: 1 });
  });

  it("exports a safe envelope without stack traces by default", async () => {
    await localStorageAdapter.saveSubmission(createSubmission("system-1"));

    const envelope = await exportDiagnosticsJson();
    const serialized = JSON.stringify(envelope);

    expect(envelope).toMatchObject({
      version: 1,
      source: "deepsignal-diagnostics-service",
      filters: {
        includeStackTraces: false,
      },
    });
    expect(envelope.diagnostics[0].errorStack).toBeUndefined();
    expect(serialized).not.toContain("answer-secret");
    expect(serialized).not.toContain("public-answer-secret");
    expect(serialized).not.toContain("session-secret");
    expect(serialized).not.toContain("signature-secret");
    expect(serialized).not.toContain("signed-bytes-secret");
    expect(serialized).not.toContain("encrypted-secret");
    expect(serialized).not.toContain("token=abc");
    expect(serialized).not.toContain("#frag");
  });

  it("summarizes diagnostics by fingerprint and route", async () => {
    await localStorageAdapter.saveSubmission(createSubmission("system-1"));
    await localStorageAdapter.saveSubmission(createSubmission("system-2", {
      createdAt: "2026-01-02T00:00:00.000Z",
    }));

    const summary = await summarizeDiagnostics();

    expect(summary.total).toBe(2);
    expect(summary.groups[0]).toMatchObject({
      key: "fp-shared",
      count: 2,
      severityMax: "error",
    });
    expect(summary.topRoutes[0]).toEqual({ routeId: "admin", count: 2 });
  });
});
