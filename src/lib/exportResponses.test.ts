import { describe, expect, it } from "vitest";
import type { FormSchema, Submission } from "../types";
import {
  buildCsvFile,
  buildExportMetadata,
  buildResponsesCsv,
  getResponsesCsvFilename,
  sanitizeCsvCell,
} from "./exportResponses";

const form: FormSchema = {
  id: "form-123",
  title: "Feedback",
  description: "",
  fields: [
    { id: "q1", type: "longText", label: "Comment", required: false, sensitive: true },
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
  it("builds one row per response with operational metadata and escaped content", () => {
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
      { language: "en", now: new Date("2026-05-16T12:00:00.000Z"), scope: "filtered" },
    );

    const [header, row] = csv.split("\r\n");
    expect(header).toBe(
      '"formTitle","exportedAt","responseCount","responseId","submittedAt","createdAt","walletAddress","isAnonymous","walrusBlobId","storageBlobId","attachments","tags","priority","triageStatus","status","notes","Comment","Score","Comment (2)"',
    );
    expect(row).toContain(
      '"Feedback","2026-05-16T12:00:00.000Z","1","response-1","2026-05-16T01:02:03.000Z","2026-05-16T01:02:03.000Z","0xabc","false","walrus-blob-1","walrus-blob-1"',
    );
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

    expect(csv).toContain(
      '"response-locked","2026-05-16T02:00:00.000Z","2026-05-16T01:02:03.000Z","","true","encrypted-blob-1","encrypted-blob-1"',
    );
    expect(csv).toContain('"[encrypted]","[encrypted]","[encrypted]"');
  });

  it("includes readable attachment summaries and triage metadata", () => {
    const csv = buildResponsesCsv(
      form,
      [
        makeSubmission({
          id: "response-with-meta",
          attachments: [
            {
              fieldId: "q1",
              type: "image",
              blobId: "blob-attachment-1",
              name: "screenshot.png",
              size: 2048,
              originalType: "image/png",
            },
          ],
          tags: ["billing", "vip"],
          priority: "high",
          triageStatus: "investigating",
          status: "read",
          notes: "Follow up with support.",
        }),
      ],
      { now: new Date("2026-05-16T12:00:00.000Z") },
    );

    expect(csv).toContain('"Feedback","2026-05-16T12:00:00.000Z","1"');
    expect(csv).toContain('"fileName=screenshot.png; blobId=blob-attachment-1; mimeType=image/png; size=2048 bytes"');
    expect(csv).toContain('"billing; vip","high","investigating","read","Follow up with support."');
  });

  it("sorts responses by createdAt descending by default and ascending when requested", () => {
    const older = makeSubmission({ id: "older", createdAt: "2026-05-16T01:00:00.000Z" });
    const newer = makeSubmission({ id: "newer", createdAt: "2026-05-16T02:00:00.000Z" });

    const descRows = buildResponsesCsv(form, [older, newer]).split("\r\n");
    expect(descRows[1]).toContain('"newer"');
    expect(descRows[2]).toContain('"older"');

    const ascRows = buildResponsesCsv(form, [older, newer], { sortOrder: "createdAtAsc" }).split("\r\n");
    expect(ascRows[1]).toContain('"older"');
    expect(ascRows[2]).toContain('"newer"');
  });

  it("redacts decrypted answer overrides when decryptedAnswers is excluded", () => {
    const unlockedText = "decrypted private answer";
    const lockedSubmission = makeSubmission({
      id: "response-field-locked",
      answers: {
        q1: { encrypted: true, value: "seal-ciphertext" },
      },
      isEncrypted: true,
      encryptedBlobId: "encrypted-blob-2",
    });

    const unlockedCsv = buildResponsesCsv(form, [lockedSubmission], {
      responseOverrides: {
        [lockedSubmission.id]: {
          answers: {
            q1: unlockedText,
          },
        },
      },
    });
    expect(unlockedCsv).toContain(`"${unlockedText}","[encrypted]","[encrypted]"`);

    const redactedCsv = buildResponsesCsv(form, [lockedSubmission], {
      excludedPiiFields: ["decryptedAnswers"],
      responseOverrides: {
        [lockedSubmission.id]: {
          answers: {
            q1: unlockedText,
          },
        },
      },
    });
    expect(redactedCsv).toContain('"[encrypted]","[encrypted]","[encrypted]"');
    expect(redactedCsv).not.toContain(unlockedText);
    expect(redactedCsv).not.toContain("seal-ciphertext");
  });

  it("can omit personal-information-like columns", () => {
    const csv = buildResponsesCsv(
      form,
      [
        makeSubmission({
          notes: "private operator note",
          attachments: [
            { fieldId: "q1", type: "document", blobId: "blob-doc", name: "contract.pdf", size: 10 },
          ],
          respondentMeta: {
            chain: "sui",
            isAnonymous: false,
            submittedAt: "2026-05-16T01:02:03.000Z",
            walletAddress: "0xabc",
          },
        }),
      ],
      { excludedPiiFields: ["walletAddress", "notes", "attachments"] },
    );

    const [header, row] = csv.split("\r\n");
    expect(header).not.toContain("walletAddress");
    expect(header).not.toContain("notes");
    expect(header).not.toContain("attachments");
    expect(row).not.toContain("0xabc");
    expect(row).not.toContain("private operator note");
    expect(row).not.toContain("contract.pdf");
  });

  it("preserves Excel-friendly CSV shape with BOM, CRLF, Japanese, emoji, newlines, and numeric-looking strings", () => {
    const csvFile = buildCsvFile(
      form,
      [
        makeSubmission({
          answers: {
            q1: "日本語 🚀\nsecond line",
            q2: "00123",
            q3: "12345678901234567890",
          },
        }),
      ],
      { now: new Date("2026-05-16T12:00:00.000Z") },
    );

    expect(csvFile.charCodeAt(0)).toBe(0xfeff);
    expect(csvFile).toContain("\r\n");
    expect(csvFile).toContain('"日本語 🚀\nsecond line"');
    expect(csvFile).toContain('"00123"');
    expect(csvFile).toContain('"12345678901234567890"');
  });

  it("sanitizes CSV injection cells before quoting", () => {
    expect(sanitizeCsvCell("=HYPERLINK(\"https://bad.example\")")).toBe(
      '"\'=HYPERLINK(""https://bad.example"")"',
    );
    expect(sanitizeCsvCell("+SUM(1,1)")).toBe("\"'+SUM(1,1)\"");
    expect(sanitizeCsvCell("-10+cmd")).toBe('"\'-10+cmd"');
    expect(sanitizeCsvCell("@cmd")).toBe('"\'@cmd"');
    expect(sanitizeCsvCell("  =1+1")).toBe('"\'  =1+1"');
  });

  it("builds export metadata for confirmation and audit logging", () => {
    const metadata = buildExportMetadata(form, [makeSubmission({})], {
      now: new Date("2026-05-16T12:00:00.000Z"),
      scope: "selected",
      exportedBy: "0xadmin",
      filterSnapshot: {
        searchQuery: "billing",
        status: "visible stream: high",
        priority: "high",
        tags: ["vip"],
        triageStatus: "investigating",
      },
      responseOverrides: {
        "response-1": {
          answers: { q1: "decrypted" },
        },
      },
    });

    expect(metadata).toMatchObject({
      title: "DeepSignal Export",
      exportedAt: "2026-05-16T12:00:00.000Z",
      formId: "form-123",
      responseCount: 1,
      filterMode: "selected",
      exportedBy: "0xadmin",
      includedDecryptedData: true,
      includedAttachmentInfo: true,
    });
    expect(metadata.filterSnapshot.searchQuery).toBe("billing");
    expect(metadata.columns).toContain("attachments");
  });

  it("uses the required deepsignal timestamped filename format", () => {
    expect(getResponsesCsvFilename("Feedback: Production Bugs!", new Date(2026, 4, 16, 9, 7))).toBe(
      "deepsignal-feedback-production-bugs-20260516-0907.csv",
    );
  });
});
