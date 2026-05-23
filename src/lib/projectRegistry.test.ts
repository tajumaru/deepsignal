import { describe, expect, it } from "vitest";
import {
  parseProjectFormMetadataReference,
  parseProjectForms,
  serializeProjectFormMetadataReference,
} from "./projectRegistry";

describe("project form metadata references", () => {
  it("serializes and parses walrus manifest references", () => {
    const encoded = serializeProjectFormMetadataReference({
      digest: "digest-123",
      manifestBlobId: "manifest-blob-1",
      formBlobId: "form-blob-1",
      formId: "form-local-1",
    });

    expect(parseProjectFormMetadataReference(encoded)).toEqual({
      digest: "digest-123",
      manifestBlobId: "manifest-blob-1",
      formBlobId: "form-blob-1",
      formId: "form-local-1",
    });
  });

  it("treats legacy metadata values as plain digests", () => {
    expect(parseProjectFormMetadataReference("legacy-digest")).toEqual({
      digest: "legacy-digest",
    });
  });

  it("hydrates parsed on-chain forms with manifest pointers when present", () => {
    const metadata = serializeProjectFormMetadataReference({
      digest: "digest-abc",
      manifestBlobId: "manifest-blob-abc",
      formBlobId: "form-blob-abc",
      formId: "form-local-abc",
    });

    const forms = parseProjectForms([
      {
        form_id: 4,
        title: "Project signal form",
        metadata_digest: metadata,
        active: true,
        created_at: "1716400000000",
      },
    ]);

    expect(forms[0]).toMatchObject({
      formId: 4,
      metadataDigest: "digest-abc",
      manifestBlobId: "manifest-blob-abc",
      formBlobId: "form-blob-abc",
      sourceFormId: "form-local-abc",
    });
  });
});
