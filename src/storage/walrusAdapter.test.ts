import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPreservedCleanupObjectIdsForSubmissionUpdate,
  readJsonBlobOrThrow,
} from "./walrusAdapter";

describe("walrusAdapter read timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects stalled blob reads instead of hanging forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    const readPromise = readJsonBlobOrThrow("blob-stalled");
    const expectation = expect(readPromise).rejects.toMatchObject({
      name: "WalrusBlobReadError",
      code: "blob_unavailable",
      blobId: "blob-stalled",
    });
    await vi.runAllTimersAsync();

    await expectation;
  }, 10000);
});

describe("getPreservedCleanupObjectIdsForSubmissionUpdate", () => {
  it("preserves Walrus objects still referenced by encrypted payload pointers", () => {
    const preserved = getPreservedCleanupObjectIdsForSubmissionUpdate(
      {
        isEncrypted: true,
        encryptedBlobId: "blob-registered",
        receiptBlobId: "blob-registered",
      },
      {
        formId: "form-1",
        formBlobId: "blob-registered",
        formBlobObjectId: "0xform",
        manifestBlobId: "blob-registered",
        manifestBlobObjectId: "0xmanifest",
        createdAt: "2026-05-10T00:00:00.000Z",
      },
      [
        {
          submissionId: "submission-1",
          formId: "form-1",
          blobId: "blob-registered",
          blobObjectId: "0xsubmission",
          createdAt: "2026-05-10T00:00:00.000Z",
        },
      ],
    );

    expect([...preserved]).toEqual(["0xform", "0xmanifest", "0xsubmission"]);
  });

  it("does not preserve superseded objects for plaintext submissions", () => {
    const preserved = getPreservedCleanupObjectIdsForSubmissionUpdate(
      {
        isEncrypted: false,
        encryptedBlobId: "blob-registered",
        receiptBlobId: "blob-registered",
      },
      {
        formId: "form-1",
        formBlobId: "blob-registered",
        formBlobObjectId: "0xform",
        manifestBlobId: "blob-registered",
        manifestBlobObjectId: "0xmanifest",
        createdAt: "2026-05-10T00:00:00.000Z",
      },
      [
        {
          submissionId: "submission-1",
          formId: "form-1",
          blobId: "blob-registered",
          blobObjectId: "0xsubmission",
          createdAt: "2026-05-10T00:00:00.000Z",
        },
      ],
    );

    expect(preserved.size).toBe(0);
  });
});
