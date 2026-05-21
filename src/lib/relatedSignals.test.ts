import { describe, expect, it } from "vitest";
import { getRelatedSignals } from "./relatedSignals";
import type { FormWithCount, SignalRecord } from "../features/admin/hooks/useSignalInboxData";
import type { Submission } from "../types";

function form(overrides: Partial<FormWithCount> = {}): FormWithCount {
  return {
    id: "form-1",
    title: "Product Feedback",
    description: "",
    fields: [],
    sections: [],
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    submissionCount: 3,
    ...overrides,
  };
}

function submission(id: string, overrides: Partial<Submission> = {}): Submission {
  return {
    id,
    formId: "form-1",
    answers: {},
    attachments: [],
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    ...overrides,
  };
}

function record(
  id: string,
  overrides: Partial<Submission> = {},
  options: {
    formOverrides?: Partial<FormWithCount>;
    category?: SignalRecord["category"];
  } = {},
): SignalRecord {
  const targetForm = form(options.formOverrides);
  return {
    form: targetForm,
    submission: submission(id, { ...overrides, formId: targetForm.id }),
    category: options.category ?? "Bug",
    searchText: "",
  };
}

describe("getRelatedSignals", () => {
  it("returns [] when selectedRecord is null", () => {
    expect(getRelatedSignals({ selectedRecord: null, records: [] })).toEqual([]);
  });

  it("excludes the selected record itself", () => {
    const selected = record("signal-1");

    expect(getRelatedSignals({ selectedRecord: selected, records: [selected] })).toEqual([]);
  });

  it("applies same-channel scoring", () => {
    const selected = record("signal-1", {
      subjectPreview: "Login failure on mobile",
      priority: "high",
      triageStatus: "investigating",
    });
    const candidate = record("signal-2", {
      subjectPreview: "Login failure on tablet",
      priority: "low",
      triageStatus: "closed",
      contributorId: "verified-user",
    });

    const [result] = getRelatedSignals({ selectedRecord: selected, records: [selected, candidate] });

    expect(result?.score).toBeGreaterThanOrEqual(3);
    expect(result?.reasons).toContain("same_channel");
  });

  it("adds shared tag score and marks duplicateLikely at score >= 6", () => {
    const selected = record("signal-1", {
      subjectPreview: "Export error on billing page",
      priority: "high",
      triageStatus: "investigating",
      tags: ["billing", "export", "csv"],
    });
    const candidate = record("signal-2", {
      subjectPreview: "Billing export error for admins",
      priority: "high",
      triageStatus: "investigating",
      tags: ["billing", "export"],
    });

    const [result] = getRelatedSignals({ selectedRecord: selected, records: [selected, candidate] });

    expect(result?.reasons).toContain("shared_tags");
    expect(result?.score).toBeGreaterThanOrEqual(6);
    expect(result?.duplicateLikely).toBe(true);
  });

  it("does not use encrypted answers for similarity", () => {
    const selected = record(
      "signal-1",
      {
        subjectPreview: "Account preferences",
        answers: { detail: "crash when exporting csv" },
        priority: "high",
        triageStatus: "investigating",
        contributorId: "verified-user",
      },
      { category: "Bug" },
    );
    const encryptedCandidate = record(
      "signal-2",
      {
        subjectPreview: "Different report entirely",
        answers: { detail: "crash when exporting csv" },
        isEncrypted: true,
        priority: "low",
        triageStatus: "closed",
      },
      {
        formOverrides: { id: "form-2", title: "Secondary Inbox" },
        category: "Feature",
      },
    );

    expect(getRelatedSignals({ selectedRecord: selected, records: [selected, encryptedCandidate] })).toEqual([]);
  });

  it("orders by score descending, then createdAt descending", () => {
    const selected = record("signal-1", {
      subjectPreview: "Save crash on editor",
      priority: "medium",
      triageStatus: "new",
      tags: ["editor"],
    });
    const newer = record("signal-2", {
      subjectPreview: "Save crash on editor panel",
      priority: "medium",
      triageStatus: "new",
      tags: ["editor"],
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    const older = record("signal-3", {
      subjectPreview: "Save crash on editor modal",
      priority: "medium",
      triageStatus: "new",
      tags: ["editor"],
      createdAt: "2026-05-20T00:00:00.000Z",
    });

    const results = getRelatedSignals({ selectedRecord: selected, records: [selected, older, newer] });

    expect(results.map((entry) => entry.record.submission.id)).toEqual(["signal-2", "signal-3"]);
  });

  it("respects maxResults", () => {
    const selected = record("signal-0", {
      subjectPreview: "Crash on save",
      priority: "high",
      tags: ["editor"],
    });
    const candidates = Array.from({ length: 7 }, (_, index) =>
      record(`signal-${index + 1}`, {
        subjectPreview: `Crash on save ${index + 1}`,
        priority: "high",
        tags: ["editor"],
      }),
    );

    expect(getRelatedSignals({ selectedRecord: selected, records: [selected, ...candidates], maxResults: 5 })).toHaveLength(5);
  });
});
