import { describe, expect, it } from "vitest";
import { getPrivateSignalPayloadState } from "./signalInbox";
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
