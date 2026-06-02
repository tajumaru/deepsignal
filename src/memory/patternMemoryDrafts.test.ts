import { describe, expect, it } from "vitest";
import type { DiagnosticsSummaryGroup, SystemDiagnostic } from "../diagnostics/types";
import type { Submission } from "../types";
import {
  createDraftFromDiagnosticsSummaryGroup,
  createDraftFromSelectedSignals,
} from "./patternMemoryDrafts";

const forbiddenValues = [
  "raw-answer-secret",
  "public-answer-secret",
  "decrypted-secret",
  "encrypted-secret",
  "attachment-secret.png",
  "session-secret",
  "signature-secret",
  "signed-bytes-secret",
  "wallet-secret",
  "0x1234567890abcdef1234567890abcdef12345678",
  "Error stack with raw-answer-secret",
  "metadata-secret",
  "token=abc",
  "#frag",
];

function expectSafeDraft(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of forbiddenValues) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toContain("\"answers\"");
  expect(serialized).not.toContain("\"publicPayload\"");
  expect(serialized).not.toContain("\"encryptedPayload\"");
  expect(serialized).not.toContain("\"attachments\"");
  expect(serialized).not.toContain("\"respondentMeta\"");
  expect(serialized).not.toContain("\"metadata\"");
  expect(serialized).not.toContain("\"errorStack\"");
  expect(serialized).not.toContain("\"responderSignature\"");
  expect(serialized).not.toContain("\"responderSignedBytes\"");
}

function submission(id: string, overrides: Partial<Submission> = {}): Submission {
  return {
    id,
    formId: "form-1",
    answers: {
      comment: "raw-answer-secret",
    },
    attachments: [
      {
        fieldId: "upload",
        type: "image",
        blobId: "attachment-secret-blob",
        name: "attachment-secret.png",
        size: 123,
      },
    ],
    publicPayload: {
      answers: {
        comment: "public-answer-secret",
      },
    },
    respondentMeta: {
      chain: "sui",
      isAnonymous: false,
      sessionId: "session-secret",
      submittedAt: "2026-01-01T00:00:00.000Z",
      walletAddress: "wallet-secret",
      verifiedAddress: "0x1234567890abcdef1234567890abcdef12345678",
    },
    metadata: {
      private: "metadata-secret",
    },
    responderSignature: "signature-secret",
    responderSignedBytes: "signed-bytes-secret",
    encryptedPayload: "encrypted-secret",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: ["mobile", "wallet"],
    notes: "Admin note: repeated wallet confusion, session=session-secret, contact test@example.com.",
    isEncrypted: false,
    category: "bug",
    aiSummary: "Users report wallet connection confusion on mobile layout.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

function systemSubmission(id: string, overrides: Partial<Submission> = {}): Submission {
  return submission(id, {
    formId: "system-signals",
    kind: "system_error",
    source: "deepsignal-runtime",
    systemSeverity: "error",
    severity: "error",
    tags: ["system", "diagnostics"],
    metadata: {
      private: "metadata-secret",
      systemDiagnostics: {
        severity: "error",
        fingerprint: "fp-safari",
        errorName: "ChunkLoadError",
        errorMessage: "Chunk failed after navigation to https://example.test/admin?token=abc#frag",
        errorStack: "Error stack with raw-answer-secret",
        routePath: "/admin?token=abc#frag",
        routeId: "admin",
        buildVersion: "0.12.20",
        platform: "iPhone Safari",
      },
    },
    ...overrides,
  });
}

describe("Signal Pattern Memory drafts", () => {
  it("creates a safe draft from a diagnostics summary group", () => {
    const group: DiagnosticsSummaryGroup = {
      key: "fp-safari",
      count: 3,
      severityMax: "critical",
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-01-02T00:00:00.000Z",
      examples: ["system-1", "system-2", "system-3"],
    };
    const diagnostics: SystemDiagnostic[] = [
      {
        id: "system-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        severity: "critical",
        fingerprint: "fp-safari",
        source: "deepsignal-runtime",
        errorName: "ChunkLoadError",
        errorMessage: "Chunk failed",
        routeId: "admin",
        routePath: "/admin",
        buildVersion: "0.12.20",
        platform: "iPhone Safari",
      },
    ];

    const draft = createDraftFromDiagnosticsSummaryGroup(group, {
      groupBy: "fingerprint",
      diagnostics,
    });

    expect(draft).toMatchObject({
      schemaVersion: "deepsignal.signal_pattern_memory.v1",
      type: "system_diagnostic_pattern",
      status: "draft",
      sourceSignalIds: ["system-1", "system-2", "system-3"],
      fingerprints: ["fp-safari"],
      affectedRoutes: ["admin", "/admin"],
      affectedBuilds: ["0.12.20"],
      platforms: ["iPhone Safari"],
      frequency: {
        count: 3,
      },
    });
    expectSafeDraft(draft);
  });

  it("creates a safe draft from selected system signals", () => {
    const draft = createDraftFromSelectedSignals([
      systemSubmission("system-1"),
      systemSubmission("system-2", {
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);

    expect(draft.type).toBe("system_diagnostic_pattern");
    expect(draft.signalKinds).toEqual(["system_signal"]);
    expect(draft.sourceSignalIds).toEqual(["system-1", "system-2"]);
    expect(draft.fingerprints).toEqual(["fp-safari"]);
    expect(draft.affectedRoutes).toEqual(["admin", "/admin"]);
    expect(draft.affectedBuilds).toEqual(["0.12.20"]);
    expect(draft.evidenceSummary.join(" ")).toContain("Chunk failed after navigation to https://example.test/admin");
    expectSafeDraft(draft);
  });

  it("creates a safe draft from selected user signals using only approved summary fields", () => {
    const draft = createDraftFromSelectedSignals([
      submission("user-1"),
      submission("user-2", {
        category: "feature",
        tags: ["templates"],
        aiSummary: "Users request reusable templates for form setup.",
        notes: "Admin note: setup mistake repeats across projects.",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);

    expect(draft.type).toBe("product_request_pattern");
    expect(draft.signalKinds).toEqual(["user_signal"]);
    expect(draft.sourceSignalIds).toEqual(["user-1", "user-2"]);
    expect(draft.tags).toEqual([
      "mobile",
      "wallet",
      "templates",
      "bug",
      "feature",
      "product_request_pattern",
    ]);
    expect(draft.summary).toBe("Users report wallet connection confusion on mobile layout.");
    expect(draft.evidenceSummary.join(" ")).toContain("Users request reusable templates for form setup.");
    expectSafeDraft(draft);
  });

  it("keeps forbidden fields out of serialized selected-signal drafts", () => {
    const draft = createDraftFromSelectedSignals([
      submission("danger-user", {
        aiSummary: undefined,
        notes: "Admin note cites encrypted_payload=encrypted-secret and 0x1234567890abcdef1234567890abcdef12345678.",
      }),
    ]);

    expect(JSON.stringify(draft)).toContain("[redacted]");
    expect(JSON.stringify(draft)).toContain("[redacted-wallet]");
    expectSafeDraft(draft);
  });
});
