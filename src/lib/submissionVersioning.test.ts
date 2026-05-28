import { describe, expect, it } from "vitest";
import type { Submission } from "../types";
import { LEGACY_SCHEMA_HASH } from "./formVersioning";
import { normalizeSubmission } from "./storage";
import {
  getSubmissionVersion,
  getSubmissionVersionCounts,
  getSubmissionVersions,
  matchesSubmissionVersion,
} from "./submissionVersioning";

function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-versioned",
    formId: "form-versioned",
    answers: {},
    attachments: [],
    category: "general",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("submission versioning utilities", () => {
  it("treats missing and invalid submission versions as v1", () => {
    expect(getSubmissionVersion({})).toBe(1);
    expect(getSubmissionVersion({ formVersion: 0 })).toBe(1);
    expect(getSubmissionVersion({ formVersion: Number.NaN })).toBe(1);
    expect(getSubmissionVersion({ formVersion: 2 })).toBe(2);
  });

  it("filters and counts submissions by normalized version", () => {
    const submissions = [
      createSubmission({ id: "legacy" }),
      createSubmission({ id: "v2-a", formVersion: 2 }),
      createSubmission({ id: "v2-b", formVersion: 2 }),
      createSubmission({ id: "invalid", formVersion: 0 }),
    ];

    expect(submissions.filter((submission) => matchesSubmissionVersion(submission, "all")).map((item) => item.id)).toEqual([
      "legacy",
      "v2-a",
      "v2-b",
      "invalid",
    ]);
    expect(submissions.filter((submission) => matchesSubmissionVersion(submission, 1)).map((item) => item.id)).toEqual([
      "legacy",
      "invalid",
    ]);
    expect(getSubmissionVersions(submissions)).toEqual([1, 2]);
    expect(getSubmissionVersionCounts(submissions)).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("normalizeSubmission version metadata", () => {
  it("normalizes legacy submissions to v1 with a legacy schema hash", () => {
    const normalized = normalizeSubmission({
      id: "legacy-submission",
      formId: "form-versioned",
      createdAt: "2026-05-28T00:00:00.000Z",
      answers: {
        impact: "legacy answer",
      },
    });

    expect(normalized).toMatchObject({
      id: "legacy-submission",
      formId: "form-versioned",
      formVersion: 1,
      schemaHash: LEGACY_SCHEMA_HASH,
      answers: {
        impact: "legacy answer",
      },
    });
    expect(normalized.formBlobId).toBeUndefined();
    expect(normalized.manifestBlobId).toBeUndefined();
  });

  it("preserves explicit submission version pointers during normalization", () => {
    const normalized = normalizeSubmission({
      id: "versioned-submission",
      formId: "form-versioned",
      formVersion: 2,
      formBlobId: "walrus-form-v2",
      schemaHash: "schema:v1:abc123",
      manifestBlobId: "walrus-manifest-v2",
      createdAt: "2026-05-28T00:00:00.000Z",
      answers: {},
    });

    expect(normalized).toMatchObject({
      formVersion: 2,
      formBlobId: "walrus-form-v2",
      schemaHash: "schema:v1:abc123",
      manifestBlobId: "walrus-manifest-v2",
    });
  });
});
