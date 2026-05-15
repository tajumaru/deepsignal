import { beforeEach, describe, expect, it } from "vitest";
import type { Submission } from "../types";
import { localStorageAdapter } from "./localStorageAdapter";

const SUBMISSIONS_KEY = "deepsignal.submissions";

function createEncryptedSubmission(): Submission {
  return {
    id: "submission-local",
    formId: "form-local",
    answers: {
      message: "top secret",
    },
    attachments: [
      {
        fieldId: "attachment-field",
        type: "image",
        blobId: "inline:local-1",
        name: "secret.png",
        size: 99,
        storage: "inline",
        encrypted: true,
        originalName: "secret.png",
        originalType: "image/png",
        encoding: "seal-base64-v1",
        inlineData: "cG5n",
      },
    ],
    metadata: {
      ua: "browser",
    },
    category: "general",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: true,
    encryptedBlobId: "encrypted-blob-local",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("localStorageAdapter encrypted submission persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does not store plaintext answers for encrypted submissions", async () => {
    await localStorageAdapter.saveSubmission(createEncryptedSubmission());

    const rawJson = window.localStorage.getItem(SUBMISSIONS_KEY) || "[]";
    const stored = JSON.parse(rawJson) as Submission[];
    expect(rawJson).not.toContain("top secret");
    expect(rawJson).not.toContain("secret.png");
    expect(rawJson).not.toContain("cG5n");
    expect(stored[0]?.answers).toEqual({});
    expect(stored[0]?.metadata).toEqual({});
  });

  it("removes plaintext attachment details when encrypted submissions are updated", async () => {
    const submission = createEncryptedSubmission();
    await localStorageAdapter.saveSubmission(submission);

    submission.attachments = [
      {
        fieldId: "attachment-field",
        type: "image",
        blobId: "inline:local-2",
        name: "another-secret.png",
        size: 120,
        storage: "inline",
        encrypted: true,
        originalName: "another-secret.png",
        originalType: "image/png",
        encoding: "seal-base64-v1",
        inlineData: "bmV3",
      },
    ];
    submission.updatedAt = new Date(1000).toISOString();

    await localStorageAdapter.updateSubmission(submission);

    const rawJson = window.localStorage.getItem(SUBMISSIONS_KEY) || "[]";
    const stored = JSON.parse(rawJson) as Submission[];
    expect(rawJson).not.toContain("another-secret.png");
    expect(rawJson).not.toContain("bmV3");
    expect(stored[0]?.attachments[0]).toMatchObject({
      fieldId: "attachment-field",
      blobId: "inline:local-2",
      encrypted: true,
      name: "Encrypted attachment",
      size: 0,
    });
    expect(stored[0]?.attachments[0]?.originalName).toBeUndefined();
    expect(stored[0]?.attachments[0]?.inlineData).toBeUndefined();
  });

  it("rejects encrypted records that still fail the leak guard", async () => {
    const submission = createEncryptedSubmission();
    submission.encryptedBlobId = undefined;

    await expect(localStorageAdapter.saveSubmission(submission)).rejects.toThrow(
      "ENCRYPTED_SUBMISSION_LEAK_GUARD_FAILED",
    );
  });
});
