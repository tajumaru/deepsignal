import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormSchema } from "../types";
import { upsertLocalFormVersionSchema } from "../storage/localFormVersions";
import { loadVersionedFormSchemas } from "./formVersionSchemas";
import { fetchJsonBlob, readManifestWithForm } from "./walrus";

vi.mock("./walrus", () => ({
  fetchJsonBlob: vi.fn(),
  readManifestWithForm: vi.fn(),
}));

const mockFetchJsonBlob = vi.mocked(fetchJsonBlob);
const mockReadManifestWithForm = vi.mocked(readManifestWithForm);

function createForm(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: "form-versioned",
    title: "Versioned signal",
    description: "",
    fields: [],
    sections: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("loadVersionedFormSchemas", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetchJsonBlob.mockReset();
    mockReadManifestWithForm.mockReset();
  });

  it("returns local fallback schemas alongside the current form", async () => {
    upsertLocalFormVersionSchema(
      createForm({
        formVersion: 1,
        schemaHash: "schema:v1",
        fields: [{ id: "impact", type: "shortText", label: "Impact", required: true, sensitive: false }],
      }),
    );

    const schemas = await loadVersionedFormSchemas(
      createForm({
        formVersion: 2,
        schemaHash: "schema:v2",
        fields: [
          { id: "impact", type: "shortText", label: "Impact", required: true, sensitive: false },
          { id: "severity", type: "rating", label: "Severity", required: false, sensitive: false },
        ],
      }),
    );

    expect(Object.keys(schemas).sort()).toEqual(["1", "2"]);
    expect(schemas[1]?.fields.map((field) => field.id)).toEqual(["impact"]);
    expect(schemas[2]?.fields.map((field) => field.id)).toEqual(["impact", "severity"]);
  });

  it("loads manifest version blobs without overwriting the current version pointer", async () => {
    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 2,
        formId: "form-versioned",
        formBlobId: "walrus-form-v2",
        currentVersion: 2,
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
        submissions: [],
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:10:00.000Z",
      },
      form: createForm({ formVersion: 2, blobId: "walrus-form-v2" }),
    });
    mockFetchJsonBlob.mockImplementation(async (blobId) => {
      if (blobId === "walrus-form-v1") {
        return createForm({
          formVersion: 1,
          schemaHash: "schema:v1",
          blobId,
          fields: [{ id: "impact", type: "shortText", label: "Impact", required: true, sensitive: false }],
        });
      }
      return null;
    });

    const schemas = await loadVersionedFormSchemas(
      createForm({
        formVersion: 2,
        schemaHash: "schema:v2",
        blobId: "walrus-form-v2",
        manifestBlobId: "walrus-manifest",
        fields: [{ id: "severity", type: "rating", label: "Severity", required: false, sensitive: false }],
      }),
    );

    expect(mockFetchJsonBlob).toHaveBeenCalledWith("walrus-form-v1");
    expect(mockFetchJsonBlob).not.toHaveBeenCalledWith("walrus-form-v2");
    expect(schemas[1]).toMatchObject({ formVersion: 1, blobId: "walrus-form-v1", manifestBlobId: "walrus-manifest" });
    expect(schemas[2]?.fields.map((field) => field.id)).toEqual(["severity"]);
  });
});
