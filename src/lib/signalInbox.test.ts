import { describe, expect, it } from "vitest";
import { getPrivateSignalPayloadState, getSignalPreview, getSignalSubject, inferSignalCategory } from "./signalInbox";
import type { Submission } from "../types";

function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    formId: "form-1",
    answers: {},
    attachments: [],
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: true,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("getPrivateSignalPayloadState", () => {
  it("treats encrypted submissions with a readable blob pointer as available", () => {
    expect(
      getPrivateSignalPayloadState(
        createSubmission({
          encryptedBlobId: "blob-encrypted",
        }),
      ),
    ).toBe("available");
  });

  it("flags onchain recovery snapshots without a readable payload reference", () => {
    expect(
      getPrivateSignalPayloadState(
        createSubmission({
          id: "onchain:project:1:2",
          tags: ["onchain-recovered"],
          receiptBlobId: "blob-receipt",
        }),
      ),
    ).toBe("missing_onchain_payload_reference");
  });

  it("flags encrypted submissions with no payload pointers as missing payload", () => {
    expect(
      getPrivateSignalPayloadState(
        createSubmission({
          receiptBlobId: undefined,
        }),
      ),
    ).toBe("missing_payload");
  });
});

describe("system signal inbox helpers", () => {
  it("uses system diagnostics for subject, preview, and category", () => {
    const submission = createSubmission({
      isEncrypted: false,
      kind: "system_error",
      source: "deepsignal-runtime",
      systemSeverity: "critical",
      severity: "critical",
      subjectPreview: "Fallback subject",
      metadata: {
        systemDiagnostics: {
          errorName: "ChunkLoadError",
          routePath: "/admin",
          buildVersion: "0.12.16",
        },
      },
    });

    expect(getSignalSubject(submission)).toBe("ChunkLoadError");
    expect(getSignalPreview(submission)).toBe("/admin / v0.12.16");
    expect(inferSignalCategory(submission)).toBe("System");
  });
});
