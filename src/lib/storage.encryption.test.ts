import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormSchema, SealAdapter, StorageAdapter, Submission } from "../types";
import { saveSubmissionWithEncryption } from "./storage";
import { createRealSealEnvelope } from "../crypto/sealPayload";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import { ENCRYPTED_ATTACHMENT_REQUIRED_MESSAGE } from "../storage/submissionSanitizer";
import { serializeSubmissionBundle } from "../storage/walrusAdapter";

function createSealEnvelope() {
  return JSON.stringify(
    createRealSealEnvelope({
      network: "testnet",
      packageId: "0xpackage",
      objectId: "0xobject",
      threshold: 1,
      serverObjectIds: ["0xserver"],
      encryptedObject: "ciphertext",
      policyId: "project_signal_v1",
      policyObjectId: "project-1",
      approvalPolicy: "project_signal_v1",
      projectId: "project-1",
    }),
  );
}

const form: FormSchema = {
  id: "form-encrypted",
  title: "Encrypted form",
  description: "",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  projectId: "project-1",
  encryptSubmissions: true,
  fields: [
    {
      id: "message",
      type: "longText",
      label: "Message",
      required: true,
      sensitive: false,
    },
  ],
};

function createEncryptedSubmission(): Submission {
  return {
    id: "submission-1",
    formId: form.id,
    answers: {
      message: "private answer",
    },
    attachments: [
      {
        fieldId: "attachment-field",
        type: "document",
        blobId: "inline:attachment-1",
        name: "secret.pdf",
        size: 42,
        storage: "inline",
        encrypted: true,
        originalName: "secret.pdf",
        originalType: "application/pdf",
        encoding: "seal-base64-v1",
        inlineData: "c2VjcmV0",
      },
    ],
    location: {
      latitude: 35.6762,
      longitude: 139.6503,
      accuracy: 18,
      capturedAt: new Date(0).toISOString(),
      source: "browser_geolocation",
    },
    metadata: {
      ipAddress: "127.0.0.1",
    },
    publicPayload: {
      answers: {
        message: "private answer",
      },
      attachments: [
        {
          fieldId: "attachment-field",
          type: "document",
          blobId: "inline:attachment-1",
          name: "secret.pdf",
          size: 42,
          storage: "inline",
          encrypted: true,
          originalName: "secret.pdf",
          originalType: "application/pdf",
          encoding: "seal-base64-v1",
          inlineData: "c2VjcmV0",
        },
      ],
    },
    category: "general",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

const fakeSealAdapter: SealAdapter = {
  encrypt: vi.fn(async () => createSealEnvelope()),
  decrypt: vi.fn(async () => "decrypted"),
};

describe("saveSubmissionWithEncryption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("redacts plaintext answers before persisting encrypted submissions", async () => {
    const persisted: Submission[] = [];
    const targetStorage: StorageAdapter = {
      saveForm: vi.fn(),
      getForm: vi.fn(),
      listForms: vi.fn(),
      deleteForm: vi.fn(),
      deleteForms: vi.fn(),
      saveSubmission: vi.fn(async (submission: Submission) => {
        persisted.push(submission);
        return { id: submission.id, blobId: "submission-blob" };
      }),
      listSubmissions: vi.fn(),
      updateSubmission: vi.fn(),
      saveEncryptedPayload: vi.fn(async () => ({ blobId: "encrypted-blob" })),
      readEncryptedPayload: vi.fn(),
      uploadFile: vi.fn(),
      readFileBlob: vi.fn(),
      readFileText: vi.fn(),
    };

    await saveSubmissionWithEncryption(form, createEncryptedSubmission(), fakeSealAdapter, targetStorage);

    expect(targetStorage.saveEncryptedPayload).toHaveBeenCalledTimes(1);
    expect(fakeSealAdapter.encrypt).toHaveBeenCalledWith(
      expect.stringContaining("\"location\":{\"latitude\":35.6762,\"longitude\":139.6503,\"accuracy\":18,\"capturedAt\":\"1970-01-01T00:00:00.000Z\",\"source\":\"browser_geolocation\"}"),
      expect.anything(),
    );
    expect(persisted).toHaveLength(1);
    const serialized = serializeSubmissionBundle(
      persisted[0] as Submission,
      {
        version: 1,
        formId: form.id,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt ?? form.createdAt,
        formBlobId: "form-blob",
        submissions: [],
      },
      form,
    );
    const rawSubmissionJson = JSON.stringify(JSON.parse(serialized).submission);

    expect(rawSubmissionJson).not.toContain("private answer");
    expect(rawSubmissionJson).not.toContain("secret.pdf");
    expect(rawSubmissionJson).not.toContain("c2VjcmV0");
    expect(rawSubmissionJson).not.toContain("\"latitude\":35.6762");
    expect(JSON.parse(rawSubmissionJson).answers).toEqual({});
    expect(JSON.parse(rawSubmissionJson).location).toBeUndefined();
    expect(JSON.parse(rawSubmissionJson).metadata).toEqual({});
    expect(JSON.parse(rawSubmissionJson).encryptedPayload).toBeUndefined();
    expect(JSON.parse(rawSubmissionJson).attachments[0]).toMatchObject({
      fieldId: "attachment-field",
      blobId: "inline:attachment-1",
      encrypted: true,
      name: "Encrypted attachment",
      size: 0,
    });
    expect(JSON.parse(rawSubmissionJson).attachments[0]?.inlineData).toBeUndefined();
  });

  it("uses single-call encrypted submission storage when the adapter supports it", async () => {
    const persisted: Submission[] = [];
    const targetStorage: StorageAdapter = {
      saveForm: vi.fn(),
      getForm: vi.fn(),
      listForms: vi.fn(),
      deleteForm: vi.fn(),
      deleteForms: vi.fn(),
      saveSubmission: vi.fn(),
      saveEncryptedSubmission: vi.fn(async (submission: Submission) => {
        persisted.push(submission);
        return { id: submission.id, blobId: "submission-blob", encryptedBlobId: "submission-blob" };
      }),
      listSubmissions: vi.fn(),
      updateSubmission: vi.fn(),
      saveEncryptedPayload: vi.fn(),
      readEncryptedPayload: vi.fn(),
      uploadFile: vi.fn(),
      readFileBlob: vi.fn(),
      readFileText: vi.fn(),
    };

    await saveSubmissionWithEncryption(form, createEncryptedSubmission(), fakeSealAdapter, targetStorage);

    expect(targetStorage.saveEncryptedPayload).not.toHaveBeenCalled();
    expect(targetStorage.saveSubmission).not.toHaveBeenCalled();
    expect(targetStorage.saveEncryptedSubmission).toHaveBeenCalledTimes(1);
    expect(persisted[0]).toMatchObject({
      isEncrypted: true,
      answers: {},
      encryptedPayload: expect.stringContaining("\"encryptedObject\":\"ciphertext\""),
    });
  });

  it("attaches form version metadata to standard saved submissions", async () => {
    const persisted: Submission[] = [];
    const versionedForm: FormSchema = {
      ...form,
      encryptSubmissions: false,
      formVersion: 3,
      schemaHash: "schema:v1:versioned",
      blobId: "walrus-form-v3",
      manifestBlobId: "walrus-manifest-v3",
    };
    const targetStorage: StorageAdapter = {
      saveForm: vi.fn(),
      getForm: vi.fn(),
      listForms: vi.fn(),
      deleteForm: vi.fn(),
      deleteForms: vi.fn(),
      saveSubmission: vi.fn(async (submission: Submission) => {
        persisted.push(submission);
        return { id: submission.id, blobId: "submission-blob" };
      }),
      listSubmissions: vi.fn(),
      updateSubmission: vi.fn(),
      saveEncryptedPayload: vi.fn(),
      readEncryptedPayload: vi.fn(),
      uploadFile: vi.fn(),
      readFileBlob: vi.fn(),
      readFileText: vi.fn(),
    };
    const result = await saveSubmissionWithEncryption(
      versionedForm,
      {
        ...createEncryptedSubmission(),
        isEncrypted: false,
        attachments: [],
        publicPayload: undefined,
      },
      fakeSealAdapter,
      targetStorage,
    );

    expect(persisted[0]).toMatchObject({
      formVersion: 3,
      formBlobId: "walrus-form-v3",
      schemaHash: "schema:v1:versioned",
      manifestBlobId: "walrus-manifest-v3",
    });
    expect(result).toMatchObject({
      formVersion: 3,
      formBlobId: "walrus-form-v3",
      schemaHash: "schema:v1:versioned",
      manifestBlobId: "walrus-manifest-v3",
    });
  });

  it("attaches form version metadata to single-call encrypted saved submissions", async () => {
    const persisted: Submission[] = [];
    const versionedForm: FormSchema = {
      ...form,
      formVersion: 4,
      schemaHash: "schema:v1:encrypted-versioned",
      blobId: "walrus-form-v4",
      manifestBlobId: "walrus-manifest-v4",
    };
    const targetStorage: StorageAdapter = {
      saveForm: vi.fn(),
      getForm: vi.fn(),
      listForms: vi.fn(),
      deleteForm: vi.fn(),
      deleteForms: vi.fn(),
      saveSubmission: vi.fn(),
      saveEncryptedSubmission: vi.fn(async (submission: Submission) => {
        persisted.push(submission);
        return { id: submission.id, blobId: "submission-blob", encryptedBlobId: "submission-blob" };
      }),
      listSubmissions: vi.fn(),
      updateSubmission: vi.fn(),
      saveEncryptedPayload: vi.fn(),
      readEncryptedPayload: vi.fn(),
      uploadFile: vi.fn(),
      readFileBlob: vi.fn(),
      readFileText: vi.fn(),
    };

    const result = await saveSubmissionWithEncryption(
      versionedForm,
      createEncryptedSubmission(),
      fakeSealAdapter,
      targetStorage,
    );

    expect(persisted[0]).toMatchObject({
      formVersion: 4,
      formBlobId: "walrus-form-v4",
      schemaHash: "schema:v1:encrypted-versioned",
      manifestBlobId: "walrus-manifest-v4",
    });
    expect(result).toMatchObject({
      formVersion: 4,
      formBlobId: "walrus-form-v4",
      schemaHash: "schema:v1:encrypted-versioned",
      manifestBlobId: "walrus-manifest-v4",
    });
  });

  it("fails closed when an encrypted submission contains an unencrypted attachment", async () => {
    const targetStorage: StorageAdapter = {
      saveForm: vi.fn(),
      getForm: vi.fn(),
      listForms: vi.fn(),
      deleteForm: vi.fn(),
      deleteForms: vi.fn(),
      saveSubmission: vi.fn(),
      listSubmissions: vi.fn(),
      updateSubmission: vi.fn(),
      saveEncryptedPayload: vi.fn(),
      readEncryptedPayload: vi.fn(),
      uploadFile: vi.fn(),
      readFileBlob: vi.fn(),
      readFileText: vi.fn(),
    };
    const submission = createEncryptedSubmission();
    submission.attachments = [
      {
        fieldId: "attachment-field",
        type: "document",
        blobId: "walrus-file-1",
        name: "plain.pdf",
        size: 12,
        storage: "blob",
      },
    ];

    await expect(
      saveSubmissionWithEncryption(form, submission, fakeSealAdapter, targetStorage),
    ).rejects.toThrow(ENCRYPTED_ATTACHMENT_REQUIRED_MESSAGE);
    expect(targetStorage.saveEncryptedPayload).not.toHaveBeenCalled();
    expect(targetStorage.saveSubmission).not.toHaveBeenCalled();
  });

  it("fails when encryption cannot produce an encrypted payload and never falls back to plaintext save", async () => {
    const failingSealAdapter: SealAdapter = {
      encrypt: vi.fn(async () => {
        throw new Error("seal exploded");
      }),
      decrypt: vi.fn(async () => "decrypted"),
    };
    const targetStorage: StorageAdapter = {
      saveForm: vi.fn(),
      getForm: vi.fn(),
      listForms: vi.fn(),
      deleteForm: vi.fn(),
      deleteForms: vi.fn(),
      saveSubmission: vi.fn(),
      listSubmissions: vi.fn(),
      updateSubmission: vi.fn(),
      saveEncryptedPayload: vi.fn(),
      readEncryptedPayload: vi.fn(),
      uploadFile: vi.fn(),
      readFileBlob: vi.fn(),
      readFileText: vi.fn(),
    };

    await expect(
      saveSubmissionWithEncryption(form, createEncryptedSubmission(), failingSealAdapter, targetStorage),
    ).rejects.toMatchObject({
      code: "ENCRYPTION_FAILED",
    });
    expect(targetStorage.saveEncryptedPayload).not.toHaveBeenCalled();
    expect(targetStorage.saveSubmission).not.toHaveBeenCalled();
  });

  it("does not preserve embedded encrypted payloads in local fallback storage", async () => {
    await expect(
      localStorageAdapter.saveSubmission({
        ...createEncryptedSubmission(),
        encryptedPayload: createSealEnvelope(),
        encryptedBlobId: undefined,
      }),
    ).rejects.toThrow("ENCRYPTED_SUBMISSION_LEAK_GUARD_FAILED");
  });
});
