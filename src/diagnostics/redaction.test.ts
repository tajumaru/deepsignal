import { describe, expect, it } from "vitest";
import type { Submission } from "../types";
import { redactSystemSignal, stripQueryAndHash } from "./redaction";

function createSystemSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "system-1",
    formId: "system:deepsignal-runtime",
    kind: "system_error",
    source: "deepsignal-runtime",
    systemSeverity: "critical",
    answers: {
      diagnostics: "raw diagnostic answers must not leak",
      secretAnswer: "do not expose",
    },
    attachments: [
      {
        fieldId: "upload",
        name: "secret.txt",
        type: "document",
        size: 32,
        blobId: "blob-secret",
        storage: "blob",
      },
    ],
    publicPayload: {
      answers: {
        private: "hidden",
      },
    },
    respondentMeta: {
      chain: "sui",
      isAnonymous: false,
      submittedAt: "2026-01-01T00:00:00.000Z",
      sessionId: "session-secret",
      walletAddress: "0xwallet",
    },
    metadata: {
      systemDiagnostics: {
        severity: "critical",
        fingerprint: "fp-1",
        sourceContext: "window.error",
        errorName: "ChunkLoadError",
        errorMessage: "Failed https://example.test/assets/app.js?token=abc#frag",
        errorStack: "Error\n at https://example.test/assets/app.js?token=abc#frag:1:2",
        routePath: "/admin?token=abc#frag",
        routeId: "admin",
        pathname: "/admin?token=abc",
        chunkUrl: "https://example.test/assets/app.js?token=abc#frag",
        buildVersion: "0.12.20",
        buildTime: "2026-01-01T00:00:00.000Z",
        gitHash: "abc123",
        platform: "MacIntel",
        mobileSafari: true,
        walletSignature: "signature-secret",
        localStorageKey: "deepsignal.submissions",
      },
      rawSecret: "do-not-export",
    },
    responderSignature: "signature-secret",
    responderSignedBytes: "signed-bytes-secret",
    responderSignedAt: "2026-01-01T00:00:00.000Z",
    encryptedPayload: "encrypted-secret",
    encryptedBlobId: "encrypted-blob",
    status: "unread",
    priority: "high",
    triageStatus: "new",
    tags: ["system"],
    notes: "",
    isEncrypted: false,
    severity: "critical",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    remoteSyncStatus: "local_only",
    ...overrides,
  };
}

describe("diagnostics redaction", () => {
  it("strips query strings and hashes from routes and URLs", () => {
    expect(stripQueryAndHash("/admin?token=abc#frag")).toBe("/admin");
    expect(stripQueryAndHash("/f/form-id?email=x")).toBe("/f/form-id");
    expect(stripQueryAndHash("https://example.test/assets/app.js?token=abc#frag")).toBe("https://example.test/assets/app.js");
  });

  it("constructs diagnostics from an allowlist and omits forbidden submission fields", () => {
    const diagnostic = redactSystemSignal(createSystemSubmission(), { includeStackTraces: true });

    expect(diagnostic).toMatchObject({
      id: "system-1",
      severity: "critical",
      fingerprint: "fp-1",
      source: "deepsignal-runtime",
      sourceContext: "window.error",
      errorName: "ChunkLoadError",
      routeId: "admin",
      routePath: "/admin",
      pathname: "/admin",
      chunkUrl: "https://example.test/assets/app.js",
      buildVersion: "0.12.20",
      remoteSyncStatus: "local_only",
    });

    const exported = JSON.stringify(diagnostic);
    expect(exported).not.toContain("secretAnswer");
    expect(exported).not.toContain("hidden");
    expect(exported).not.toContain("session-secret");
    expect(exported).not.toContain("signature-secret");
    expect(exported).not.toContain("signed-bytes-secret");
    expect(exported).not.toContain("encrypted-secret");
    expect(exported).not.toContain("secret.txt");
    expect(exported).not.toContain("rawSecret");
    expect(exported).not.toContain("deepsignal.submissions");
    expect(exported).not.toContain("token=abc");
    expect(exported).not.toContain("#frag");
  });

  it("omits stack traces unless requested", () => {
    expect(redactSystemSignal(createSystemSubmission())?.errorStack).toBeUndefined();
    expect(redactSystemSignal(createSystemSubmission(), { includeStackTraces: true })?.errorStack).toContain(
      "https://example.test/assets/app.js",
    );
  });

  it("ignores non-system submissions", () => {
    expect(redactSystemSignal(createSystemSubmission({ kind: undefined, source: undefined }))).toBeNull();
  });
});
