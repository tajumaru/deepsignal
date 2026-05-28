import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormSchema, Submission } from "../types";
import { exportSubmissionJson, exportSubmissionsCsv } from "./export";

const { downloadTextFileMock } = vi.hoisted(() => ({
  downloadTextFileMock: vi.fn(),
}));

vi.mock("./utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("./utils")>(),
  downloadTextFile: downloadTextFileMock,
}));

const v1Form = {
  id: "form-versioned",
  title: "Signal intake",
  description: "",
  formVersion: 1,
  schemaHash: "schema:v1",
  fields: [{ id: "q1", type: "shortText", label: "Legacy question", required: false, sensitive: false }],
  createdAt: "2026-05-16T00:00:00.000Z",
} satisfies FormSchema;

const v2Form = {
  ...v1Form,
  formVersion: 2,
  schemaHash: "schema:v2",
  fields: [{ id: "q9", type: "shortText", label: "Current question", required: false, sensitive: false }],
} satisfies FormSchema;

function createSubmission(overrides: Partial<Submission>): Submission {
  return {
    id: "submission-1",
    formId: v2Form.id,
    answers: {},
    attachments: [],
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: "2026-05-16T01:00:00.000Z",
    updatedAt: "2026-05-16T01:00:00.000Z",
    ...overrides,
  };
}

describe("legacy export helpers", () => {
  beforeEach(() => {
    downloadTextFileMock.mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("exports single-response JSON with the response version schema", () => {
    exportSubmissionJson(
      v2Form,
      createSubmission({
        formVersion: 1,
        schemaHash: "schema:v1",
        formBlobId: "walrus-form-v1",
        manifestBlobId: "walrus-manifest",
        answers: { q1: "old answer" },
      }),
      { versionedForms: { 1: v1Form, 2: v2Form } },
    );

    expect(downloadTextFileMock).toHaveBeenCalledOnce();
    const [, contents] = downloadTextFileMock.mock.calls[0];
    const payload = JSON.parse(contents);
    expect(payload.form).toMatchObject({ formVersion: 1, schemaHash: "schema:v1" });
    expect(payload.submission.formattedAnswers.q1).toEqual({
      label: "Legacy question",
      value: "old answer",
    });
    expect(payload.metadata).toMatchObject({
      formVersion: 1,
      schemaHash: "schema:v1",
      formBlobId: "walrus-form-v1",
      manifestBlobId: "walrus-manifest",
    });
  });

  it("keeps mixed-version CSV answers under their original schema columns", () => {
    exportSubmissionsCsv(
      v2Form,
      [
        createSubmission({ id: "v1-response", formVersion: 1, answers: { q1: "old answer" } }),
        createSubmission({ id: "v2-response", formVersion: 2, answers: { q9: "new answer" } }),
      ],
      { versionedForms: { 1: v1Form, 2: v2Form } },
    );

    expect(downloadTextFileMock).toHaveBeenCalledOnce();
    const [, csv] = downloadTextFileMock.mock.calls[0];
    const [header, firstRow, secondRow] = csv.split("\n");
    expect(header).toContain('"v1: Legacy question"');
    expect(header).toContain('"v2: Current question"');
    expect(firstRow).toContain('"v1-response"');
    expect(firstRow.endsWith('"old answer",""')).toBe(true);
    expect(secondRow).toContain('"v2-response"');
    expect(secondRow.endsWith('"","new answer"')).toBe(true);
  });
});
