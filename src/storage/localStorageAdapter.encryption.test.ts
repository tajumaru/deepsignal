import { beforeEach, describe, expect, it } from "vitest";
import type { FormSchema, Submission } from "../types";
import {
  cleanupRegisteredFormLocalFallback,
  cleanupRegisteredSubmissionLocalFallback,
  localStorageAdapter,
} from "./localStorageAdapter";
import { readLocalFormVersionSchemas } from "./localFormVersions";

const FORMS_KEY = "deepsignal.forms";
const SUBMISSIONS_KEY = "deepsignal.submissions";
const LOCAL_FORM_VERSION_SCHEMAS_KEY = "deepsignal.formVersionSchemas";
const CORRUPTED_SUBMISSIONS_PREFIX = "deepsignal.corrupted.deepsignal.submissions.";

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

function createForm(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: "form-local",
    title: "Local signal",
    description: "Local provisional signal",
    fields: [],
    sections: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ownerAddress: "0xowner",
    projectId: "0xproject",
    manifestBlobId: "walrus-manifest-1",
    blobId: "walrus-form-1",
    ...overrides,
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

  it("quarantines corrupted local submission state and recovers with an empty list", async () => {
    window.localStorage.setItem(SUBMISSIONS_KEY, "{not-json");

    await expect(localStorageAdapter.listSubmissions("form-local")).resolves.toEqual([]);
    expect(window.localStorage.getItem(SUBMISSIONS_KEY)).toBeNull();

    const quarantineKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith(CORRUPTED_SUBMISSIONS_PREFIX),
    );
    expect(quarantineKey).toBeTruthy();
    expect(window.localStorage.getItem(quarantineKey || "")).toContain("{not-json");
  });

  it("promotes a Sui-registered form and removes matching provisional local forms", async () => {
    const draftForm = createForm({
      id: "draft-form",
      manifestBlobId: undefined,
      blobId: undefined,
    });
    const provisionalForm = createForm();
    const duplicateProvisionalForm = createForm({
      id: "form-duplicate",
      title: "Duplicate local signal",
    });
    await localStorageAdapter.saveForm(draftForm);
    await localStorageAdapter.saveForm(provisionalForm);
    await localStorageAdapter.saveForm(duplicateProvisionalForm);

    await cleanupRegisteredFormLocalFallback({
      ...provisionalForm,
      onchainFormId: 42,
      isOnchain: true,
      registrationMode: "sui",
    });

    const stored = JSON.parse(window.localStorage.getItem(FORMS_KEY) || "[]") as FormSchema[];
    expect(stored.map((form) => form.id)).toEqual(["form-local", "draft-form"]);
    expect(stored[0]).toMatchObject({
      onchainFormId: 42,
      isOnchain: true,
      registrationMode: "sui",
    });
  });

  it("preserves local form schemas by version when answered forms are structurally edited", async () => {
    const v1Form = createForm({
      fields: [
        {
          id: "impact",
          type: "shortText",
          label: "Impact",
          required: true,
          sensitive: false,
        },
      ],
      formVersion: 1,
    });
    await localStorageAdapter.saveForm(v1Form);
    await localStorageAdapter.saveSubmission({
      ...createEncryptedSubmission(),
      isEncrypted: false,
      encryptedBlobId: undefined,
      answers: {
        impact: "Checkout blocked",
      },
      formVersion: 1,
      schemaHash: "schema:v1",
    });

    const v2Result = await localStorageAdapter.saveForm({
      ...v1Form,
      fields: [
        ...v1Form.fields,
        {
          id: "severity",
          type: "rating",
          label: "Severity",
          required: false,
          sensitive: false,
        },
      ],
    });

    expect(v2Result.formVersion).toBe(2);
    const schemas = readLocalFormVersionSchemas("form-local");
    expect(schemas[1]?.fields.map((field) => field.id)).toEqual(["impact"]);
    expect(schemas[2]?.fields.map((field) => field.id)).toEqual(["impact", "severity"]);
  });

  it("removes local form version schemas when a form is deleted", async () => {
    await localStorageAdapter.saveForm(createForm({ formVersion: 1 }));
    expect(window.localStorage.getItem(LOCAL_FORM_VERSION_SCHEMAS_KEY)).toContain("form-local");

    await localStorageAdapter.deleteForm("form-local");

    expect(readLocalFormVersionSchemas("form-local")).toEqual({});
  });

  it("promotes a Sui-registered submission and removes matching local provisional records", async () => {
    const draftSubmission = createEncryptedSubmission();
    draftSubmission.id = "draft-submission";
    draftSubmission.receiptBlobId = undefined;
    draftSubmission.pendingOnchainRegistration = false;
    const provisionalSubmission = {
      ...createEncryptedSubmission(),
      id: "submission-local",
      receiptBlobId: "walrus-receipt-1",
      pendingOnchainRegistration: true,
    };
    const duplicateProvisionalSubmission = {
      ...createEncryptedSubmission(),
      id: "submission-duplicate",
      receiptBlobId: "walrus-receipt-1",
      pendingOnchainRegistration: true,
    };
    await localStorageAdapter.saveSubmission(draftSubmission);
    await localStorageAdapter.saveSubmission(provisionalSubmission);
    await localStorageAdapter.saveSubmission(duplicateProvisionalSubmission);

    await cleanupRegisteredSubmissionLocalFallback({
      ...provisionalSubmission,
      pendingOnchainRegistration: false,
      onchainSignalId: 99,
      signalReceiptMetadataDigest: "signal-digest-99",
      onchainStatus: "new",
    });

    const stored = JSON.parse(window.localStorage.getItem(SUBMISSIONS_KEY) || "[]") as Submission[];
    expect(stored.map((submission) => submission.id)).toEqual(["submission-local", "draft-submission"]);
    expect(stored[0]).toMatchObject({
      onchainSignalId: 99,
      pendingOnchainRegistration: false,
      signalReceiptMetadataDigest: "signal-digest-99",
    });
  });
});
