import { describe, expect, it } from "vitest";
import { findRelatedSignals } from "./relatedSignals";
import type { FormWithCount, SignalRecord } from "../hooks/useSignalInboxData";
import type { Submission } from "../../../types";

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

function record(id: string, overrides: Partial<Submission> = {}, formOverrides: Partial<FormWithCount> = {}): SignalRecord {
  const targetForm = form(formOverrides);
  const targetSubmission = submission(id, { ...overrides, formId: targetForm.id });
  return {
    form: targetForm,
    submission: targetSubmission,
    category: "Bug",
    searchText: "",
  };
}

describe("findRelatedSignals", () => {
  it("returns highest scoring related signals first and excludes the selected record", () => {
    const selectedRecord = record("signal-1", {
      subjectPreview: "Login fails on mobile",
      priority: "high",
      triageStatus: "investigating",
      tags: ["auth", "mobile"],
      keywords: ["login", "mobile"],
    });
    const sameChannelCloseMatch = record("signal-2", {
      subjectPreview: "Login fails on iPhone",
      priority: "high",
      triageStatus: "investigating",
      tags: ["auth", "mobile"],
      keywords: ["login", "iphone"],
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    const weakerMatch = record("signal-3", {
      subjectPreview: "Android feedback",
      priority: "low",
      triageStatus: "new",
      tags: ["mobile"],
      keywords: ["android"],
    });

    const result = findRelatedSignals({
      selectedRecord,
      visibleSignals: [selectedRecord, sameChannelCloseMatch, weakerMatch],
      allSignals: [selectedRecord, sameChannelCloseMatch, weakerMatch],
    });

    expect(result.matches.map((match) => match.record.submission.id)).toEqual(["signal-2", "signal-3"]);
    expect(result.matches[0]?.reasons).toContain("same_channel");
    expect(result.matches[0]?.score).toBeGreaterThan(result.matches[1]?.score ?? 0);
  });

  it("uses only safe visible metadata for encrypted matches", () => {
    const selectedRecord = record("signal-1", {
      subjectPreview: "Billing export issue",
      isEncrypted: true,
      priority: "medium",
      tags: ["billing"],
      keywords: ["export"],
      encryptedPayload: "secret-one",
    });
    const encryptedCandidate = record("signal-2", {
      subjectPreview: "Billing export issue",
      isEncrypted: true,
      priority: "medium",
      tags: ["billing"],
      keywords: ["export"],
      encryptedPayload: "completely-different-secret",
    });

    const result = findRelatedSignals({
      selectedRecord,
      visibleSignals: [selectedRecord, encryptedCandidate],
      allSignals: [selectedRecord, encryptedCandidate],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.duplicateStrength).toBe("strong");
    expect(result.duplicateHint).toBe("possible_duplicate");
  });

  it("caps the result set at five items", () => {
    const selectedRecord = record("signal-0", {
      subjectPreview: "Crash on save",
      tags: ["editor"],
      keywords: ["crash"],
      priority: "high",
    });
    const candidates = Array.from({ length: 7 }, (_, index) =>
      record(`signal-${index + 1}`, {
        subjectPreview: `Crash on save ${index + 1}`,
        tags: ["editor"],
        keywords: ["crash"],
        priority: "high",
      }),
    );

    const result = findRelatedSignals({
      selectedRecord,
      visibleSignals: [selectedRecord, ...candidates],
      allSignals: [selectedRecord, ...candidates],
    });

    expect(result.matches).toHaveLength(5);
  });
});
