import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormSchema, SignalManifest } from "../types";
import {
  getPreservedCleanupObjectIdsForSubmissionUpdate,
  normalizeManifest,
  readJsonBlobOrThrow,
  shouldCleanupSupersededManifestObjects,
} from "./walrusAdapter";

function createForm(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: "form-manifest",
    title: "Manifest signal",
    description: "",
    fields: [],
    sections: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

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

describe("normalizeManifest", () => {
  it("normalizes v1 manifests into a v2 compatible view", () => {
    const manifest: SignalManifest = {
      version: 1,
      formId: "form-manifest",
      formBlobId: "walrus-form-v1",
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:05:00.000Z",
      submissions: [
        {
          submissionId: "submission-1",
          blobId: "walrus-submission-1",
          createdAt: "2026-05-28T00:06:00.000Z",
        },
      ],
    };

    const normalized = normalizeManifest(manifest, {
      carrierBlobId: "walrus-manifest-v1",
      form: createForm({ formVersion: 1, schemaHash: "schema:v1", title: "Initial title" }),
    });

    expect(normalized.version).toBe(2);
    expect(normalized.currentVersion).toBe(1);
    expect(normalized.versions).toEqual([
      {
        version: 1,
        formBlobId: "walrus-form-v1",
        schemaHash: "schema:v1",
        createdAt: "2026-05-28T00:00:00.000Z",
        publishedAt: "2026-05-28T00:05:00.000Z",
        titleSnapshot: "Initial title",
      },
    ]);
    expect(normalized.submissions[0]).toMatchObject({
      formVersion: 1,
      formBlobId: "walrus-form-v1",
      schemaHash: "schema:v1",
    });
  });

  it("preserves existing v2 versions and backfills missing submission metadata", () => {
    const normalized = normalizeManifest(
      {
        version: 2,
        formId: "form-manifest",
        formBlobId: "walrus-form-v2",
        currentVersion: 2,
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:10:00.000Z",
        versions: [
          {
            version: 1,
            formBlobId: "walrus-form-v1",
            schemaHash: "schema:v1",
            createdAt: "2026-05-28T00:00:00.000Z",
            publishedAt: "2026-05-28T00:00:00.000Z",
          },
          {
            version: 2,
            formBlobId: "walrus-form-v2",
            schemaHash: "schema:v2",
            createdAt: "2026-05-28T00:10:00.000Z",
            publishedAt: "2026-05-28T00:10:00.000Z",
          },
        ],
        submissions: [
          {
            submissionId: "submission-current",
            blobId: "walrus-submission-current",
            createdAt: "2026-05-28T00:11:00.000Z",
          },
          {
            submissionId: "submission-v1",
            blobId: "walrus-submission-v1",
            createdAt: "2026-05-28T00:01:00.000Z",
            formVersion: 1,
            formBlobId: "walrus-form-v1",
            schemaHash: "schema:v1",
          },
        ],
      },
      { carrierBlobId: "walrus-manifest-v2", form: null },
    );

    expect(normalized.versions?.map((version) => version.version)).toEqual([1, 2]);
    expect(normalized.submissions[0]).toMatchObject({
      formVersion: 2,
      formBlobId: "walrus-form-v2",
      schemaHash: "schema:v2",
    });
    expect(normalized.submissions[1]).toMatchObject({
      formVersion: 1,
      formBlobId: "walrus-form-v1",
      schemaHash: "schema:v1",
    });
  });

  it("resolves bundled form pointers to the carrier blob id for legacy bundles", () => {
    const normalized = normalizeManifest(
      {
        version: 1,
        formId: "form-manifest",
        formBlobId: "__bundled_form__",
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:05:00.000Z",
        submissions: [],
      },
      { carrierBlobId: "walrus-bundle", form: null },
    );

    expect(normalized.formBlobId).toBe("walrus-bundle");
    expect(normalized.versions?.[0]?.formBlobId).toBe("walrus-bundle");
  });
});

describe("shouldCleanupSupersededManifestObjects", () => {
  it("allows cleanup only for legacy manifests without version history", () => {
    expect(shouldCleanupSupersededManifestObjects(null)).toBe(false);
    expect(shouldCleanupSupersededManifestObjects({ version: 1 })).toBe(true);
    expect(shouldCleanupSupersededManifestObjects({ version: 2 })).toBe(false);
    expect(shouldCleanupSupersededManifestObjects({ version: 3 })).toBe(false);
  });
});
