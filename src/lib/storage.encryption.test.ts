import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormSchema, SealAdapter, StorageAdapter, Submission } from "../types";
import { saveSubmissionWithEncryption } from "./storage";
import { createRealSealEnvelope } from "../crypto/sealPayload";
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
    expect(JSON.parse(rawSubmissionJson).answers).toEqual({});
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
});
