import { describe, expect, it } from "vitest";
import type { FormSchema, Submission } from "../types";
import { buildResponsesCsv, getResponsesCsvFilename } from "./exportResponses";

const form: FormSchema = {
  id: "form-123",
  title: "Feedback",
  description: "",
  fields: [
    { id: "q1", type: "longText", label: "Comment", required: false, sensitive: false },
    { id: "q2", type: "rating", label: "Score", required: false, sensitive: false },
    { id: "q3", type: "shortText", label: "Comment", required: false, sensitive: false },
  ],
  createdAt: "2026-05-16T00:00:00.000Z",
};

function makeSubmission(overrides: Partial<Submission>): Submission {
  return {
    id: "response-1",
    formId: form.id,
    answers: {},
    attachments: [],
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: "2026-05-16T01:02:03.000Z",
    updatedAt: "2026-05-16T01:02:03.000Z",
    ...overrides,
  };
}

describe("responses CSV export", () => {
  it("builds one row per response and escapes commas, quotes, newlines, and Japanese text", () => {
    const csv = buildResponsesCsv(
      form,
      [
        makeSubmission({
          answers: {
            q1: "日本語, comma, and \"quotes\"\nsecond line",
            q2: 5,
          },
          respondentMeta: {
            chain: "sui",
            isAnonymous: false,
            submittedAt: "2026-05-16T01:02:03.000Z",
            walletAddress: "0xabc",
          },
          blobId: "walrus-blob-1",
        }),
      ],
      { language: "en" },
    );

    const [header, row] = csv.split("\r\n");
    expect(header).toBe(
      '"responseId","submittedAt","walletAddress","respondentAddress","isAnonymous","walrusBlobId","storageBlobId","Comment","Score","Comment (2)"',
    );
    expect(row).toContain('"response-1","2026-05-16T01:02:03.000Z","0xabc","0xabc","false","walrus-blob-1","walrus-blob-1"');
    expect(row).toContain('"日本語, comma, and ""quotes""\nsecond line"');
    expect(row.endsWith(',"5",""')).toBe(true);
  });

  it("marks locked encrypted answers without requiring decrypt logic during export", () => {
    const csv = buildResponsesCsv(form, [
      makeSubmission({
        id: "response-locked",
        answers: {},
        isEncrypted: true,
        encryptedBlobId: "encrypted-blob-1",
        respondentMeta: {
          chain: "sui",
          isAnonymous: true,
          submittedAt: "2026-05-16T02:00:00.000Z",
        },
      }),
    ]);

    expect(csv).toContain('"response-locked","2026-05-16T02:00:00.000Z","","","true","encrypted-blob-1","encrypted-blob-1"');
    expect(csv).toContain('"[encrypted]","[encrypted]","[encrypted]"');
  });

  it("uses the required deepsignal timestamped filename format", () => {
    expect(getResponsesCsvFilename("form-123", new Date(2026, 4, 16, 9, 7))).toBe(
      "deepsignal-form-123-responses-20260516-0907.csv",
    );
  });
});
