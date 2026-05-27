import { describe, expect, it } from "vitest";
import {
  parseProjectMembers,
  parseProjectSummary,
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

describe("project member roles", () => {
  it("parses co-admin and reviewer members from on-chain project fields", () => {
    expect(
      parseProjectMembers([
        { addr: "0xB", role: "1" },
        { addr: "0xC", role: "2" },
      ]),
    ).toEqual([
      { address: "0xb", role: "co_admin", roleCode: 1 },
      { address: "0xc", role: "reviewer", roleCode: 2 },
    ]);
  });

  it("keeps the creator as a co-admin while adding legacy admins, member co-admins, and reviewers", () => {
    const project = parseProjectSummary("0xPROJECT", {
      name: "Signal desk",
      owner: "0xA",
      admins: ["0xB"],
      members: [
        { addr: "0xC", role: "1" },
        { addr: "0xD", role: "2" },
      ],
      forms_count: "0",
      signals_count: "0",
      forms: [],
      signals: [],
    });

    expect(project?.admins).toEqual(["0xa", "0xb", "0xc"]);
    expect(project?.reviewers).toEqual(["0xd"]);
  });
});
