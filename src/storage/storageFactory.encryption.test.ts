import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Submission } from "../types";

const SUBMISSIONS_KEY = "deepsignal.submissions";

function createEncryptedSubmission(): Submission {
  return {
    id: "submission-fallback",
    formId: "form-fallback",
    answers: {
      message: "fallback secret",
    },
    attachments: [
      {
        fieldId: "attachment-field",
        type: "document",
        blobId: "inline:fallback-1",
        name: "secret.txt",
        size: 11,
        storage: "inline",
        encrypted: true,
        originalName: "secret.txt",
        originalType: "text/plain",
        encoding: "seal-base64-v1",
        inlineData: "c2VjcmV0",
      },
    ],
    metadata: {
      source: "walrus-fallback",
    },
    category: "general",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: true,
    encryptedBlobId: "encrypted-blob-fallback",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("storageFactory encrypted fallback persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
    vi.stubEnv("VITE_STORAGE_MODE", "walrus");
    vi.stubEnv("VITE_WALRUS_AGGREGATOR_URL", "https://aggregator.example");
    vi.stubEnv("VITE_WALRUS_UPLOAD_RELAY_URL", "https://relay.example");
  });

  afterEach(() => {
    vi.doUnmock("./walrusAdapter");
    vi.unstubAllEnvs();
  });

  it("keeps encrypted submission answers redacted when Walrus falls back to local storage", async () => {
    vi.doMock("./walrusAdapter", () => ({
      walrusAdapter: {
        saveForm: vi.fn(),
        getForm: vi.fn(),
        listForms: vi.fn(),
        deleteForm: vi.fn(),
        deleteForms: vi.fn(),
        saveSubmission: vi.fn(async () => {
          throw new Error("Walrus upload failed.");
        }),
        listSubmissions: vi.fn(),
        updateSubmission: vi.fn(),
        saveEncryptedPayload: vi.fn(),
        readEncryptedPayload: vi.fn(),
        uploadFile: vi.fn(),
        readFileBlob: vi.fn(),
        readFileText: vi.fn(),
      },
      getWalrusBlobUrl: vi.fn(() => null),
    }));

    const { storage } = await import("./storageFactory");
    await storage.saveSubmission(createEncryptedSubmission());

    const rawJson = window.localStorage.getItem(SUBMISSIONS_KEY) || "[]";
    const stored = JSON.parse(rawJson) as Submission[];
    expect(rawJson).not.toContain("fallback secret");
    expect(rawJson).not.toContain("secret.txt");
    expect(rawJson).not.toContain("c2VjcmV0");
    expect(stored[0]?.answers).toEqual({});
    expect(stored[0]?.metadata).toEqual({});
  });

  it("rejects production fallback for encrypted payload reads and writes", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.doMock("./walrusAdapter", () => ({
      walrusAdapter: {
        saveForm: vi.fn(),
        getForm: vi.fn(),
        listForms: vi.fn(),
        deleteForm: vi.fn(),
        deleteForms: vi.fn(),
        saveSubmission: vi.fn(async () => {
          throw new Error("Walrus upload failed.");
        }),
        listSubmissions: vi.fn(),
        updateSubmission: vi.fn(),
        saveEncryptedPayload: vi.fn(async () => {
          throw new Error("Walrus upload failed.");
        }),
        readEncryptedPayload: vi.fn(async () => null),
        uploadFile: vi.fn(),
        readFileBlob: vi.fn(),
        readFileText: vi.fn(),
      },
      getWalrusBlobUrl: vi.fn(() => null),
    }));

    const { storage } = await import("./storageFactory");

    await expect(storage.saveEncryptedPayload("ciphertext")).rejects.toThrow("Walrus upload failed.");
    await expect(storage.saveSubmission(createEncryptedSubmission())).rejects.toThrow("Walrus upload failed.");
    await expect(storage.readEncryptedPayload("walrus-blob-1")).resolves.toBeNull();
    expect(window.localStorage.getItem(SUBMISSIONS_KEY)).toBeNull();
  });
});
