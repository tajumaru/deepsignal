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

    expect(diagnostic?.errorStack).toBeUndefined();
    expect(diagnostic?.routePath).toBe("/admin");

    const diagnosticWithStack = await getDiagnostic("system-1", { includeStackTraces: true });
    expect(diagnosticWithStack?.errorStack).toBe("Error stack with [redacted]");
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
      count: 1,
      totalMatching: 1,
      truncated: false,
      maxLimit: 500,
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
    expect(serialized).not.toContain("source\":{\"kind\"");
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

  it("exports diagnostics from already-loaded admin inbox records", async () => {
    await localStorageAdapter.saveSubmission(createSubmission("local-system"));
    const inboxSubmission = createSubmission("inbox-system", {
      metadata: {
        systemDiagnostics: {
          severity: "critical",
          fingerprint: "fp-inbox",
          errorName: "InboxLoadedError",
          errorMessage: "Loaded from admin inbox",
          routePath: "/dashboard?token=secret",
          routeId: "admin",
          buildVersion: "0.12.22",
        },
      },
      systemSeverity: "critical",
    });

    const envelope = await exportDiagnosticsJson({
      source: {
        kind: "adminInboxLoadedRecords",
        records: [{ submission: inboxSubmission }],
      },
    });

    expect(envelope.count).toBe(1);
    expect(envelope.diagnostics[0]).toMatchObject({
      id: "inbox-system",
      errorName: "InboxLoadedError",
      routePath: "/dashboard",
    });
    expect(JSON.stringify(envelope)).not.toContain("local-system");
    expect(JSON.stringify(envelope)).not.toContain("token=secret");
  });

  it("applies default limit, max limit, totalMatching, and truncated metadata", async () => {
    const submissions = Array.from({ length: 55 }, (_, index) =>
      createSubmission(`system-${index}`, {
        createdAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const defaultLimited = await listDiagnostics({
      source: {
        kind: "adminInboxLoadedRecords",
        submissions,
      },
    });
    const maxLimited = await listDiagnostics({
      limit: 1000,
      source: {
        kind: "adminInboxLoadedRecords",
        submissions: Array.from({ length: 505 }, (_, index) => createSubmission(`max-${index}`)),
      },
    });

    expect(defaultLimited).toMatchObject({
      total: 50,
      totalMatching: 55,
      limit: 50,
      maxLimit: 500,
      truncated: true,
    });
    expect(defaultLimited.diagnostics[0].id).toBe("system-54");
    expect(maxLimited).toMatchObject({
      total: 500,
      totalMatching: 505,
      limit: 500,
      maxLimit: 500,
      truncated: true,
    });
  });
});
