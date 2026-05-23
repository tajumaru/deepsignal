import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "../../../lib/projectRegistry";
import type { FormSchema } from "../../../types";
import {
  createShadowForm,
  mergeFormsWithProjectRegistry,
  type FormWithCount,
} from "./useSignalInboxData";

function createProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    objectId: "0xproject-1",
    name: "Project One",
    owner: "0xowner-1",
    admins: [],
    formsCount: 1,
    signalsCount: 0,
    onchainForms: [],
    onchainSignals: [],
    createdAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}

function createForm(overrides: Partial<FormSchema> = {}): FormWithCount {
  return {
    id: "form-1",
    title: "Local form",
    description: "Local cache form",
    fields: [],
    sections: [],
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    ownerAddress: "0xowner-1",
    creationMode: "admin",
    submissionCount: 0,
    ...overrides,
  };
}

describe("mergeFormsWithProjectRegistry", () => {
  it("adds shadow forms for on-chain project forms when local cache is empty", () => {
    const project = createProject({
      objectId: "0xproject-a",
      owner: "0xowner-a",
      onchainForms: [
        {
          formId: 7,
          title: "Recovered chain form",
          metadataDigest: "digest-7",
          active: true,
          createdAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      onchainSignals: [
        {
          signalId: 99,
          formId: 7,
          walrusBlobId: "blob-99",
          metadataDigest: "signal-digest-99",
          encrypted: true,
          status: "new",
          createdAt: "2026-05-22T01:00:00.000Z",
        },
      ],
    });

    const merged = mergeFormsWithProjectRegistry([], [project], null);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "onchain:0xproject-a:7",
      projectId: "0xproject-a",
      onchainFormId: 7,
      isOnchain: true,
      submissionCount: 1,
    });
  });

  it("does not duplicate forms already represented in local cache", () => {
    const project = createProject({
      objectId: "0xproject-a",
      onchainForms: [
        {
          formId: 7,
          title: "Recovered chain form",
          metadataDigest: "digest-7",
          active: true,
          createdAt: "2026-05-22T00:00:00.000Z",
        },
      ],
    });
    const localForm = createForm({
      id: "local-form-7",
      projectId: "0xproject-a",
      onchainFormId: 7,
    });

    const merged = mergeFormsWithProjectRegistry([localForm], [project], null);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("local-form-7");
  });

  it("keeps the preferred project shadow forms first when rebuilding from registry", () => {
    const preferredProject = createProject({
      objectId: "0xpreferred",
      name: "Preferred",
      onchainForms: [
        {
          formId: 1,
          title: "Preferred form",
          metadataDigest: "digest-1",
          active: true,
        },
      ],
    });
    const otherProject = createProject({
      objectId: "0xother",
      name: "Other",
      onchainForms: [
        {
          formId: 2,
          title: "Other form",
          metadataDigest: "digest-2",
          active: true,
        },
      ],
    });

    const merged = mergeFormsWithProjectRegistry([], [otherProject, preferredProject], preferredProject);

    expect(merged.map((form) => form.id)).toEqual([
      createShadowForm(preferredProject, preferredProject.onchainForms?.[0], 1).id,
      createShadowForm(otherProject, otherProject.onchainForms?.[0], 2).id,
    ]);
  });
});
