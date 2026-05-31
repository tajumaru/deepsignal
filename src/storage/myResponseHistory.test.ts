import { beforeEach, describe, expect, it } from "vitest";
import {
  lifecycleStatusFromTriageStatus,
  lifecycleStatusFromSubmissionState,
  listMyResponseHistory,
  mergeMyResponseLifecycleFromSubmission,
  updateMyResponseLifecycleFromSubmission,
  upsertMyResponseHistoryEntry,
  type MyResponseHistoryEntry,
} from "./myResponseHistory";

const HISTORY_KEY = "deepsignal.myResponseHistory.v1";

function buildEntry(overrides: Partial<MyResponseHistoryEntry> = {}): MyResponseHistoryEntry {
  return {
    submissionId: "submission-1",
    formId: "form-1",
    formTitle: "Signal intake",
    submittedAt: "2026-05-01T00:00:00.000Z",
    status: "submitted",
    storageMode: "local",
    answerSummary: "Impact: high",
    answers: { impact: "high" },
    fields: [],
    ...overrides,
  };
}

describe("my response lifecycle history", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("normalizes legacy entries without lifecycle fields", () => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([buildEntry()]));

    expect(listMyResponseHistory()[0]).toMatchObject({
      lifecycleStatus: "received",
      roadmapStatus: undefined,
      triageStatus: undefined,
      lifecycleEvents: [
        {
          status: "received",
          at: "2026-05-01T00:00:00.000Z",
          source: "sender",
        },
      ],
    });
  });

  it("ignores invalid legacy lifecycle and triage fields", () => {
    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        {
          ...buildEntry(),
          lifecycleStatus: "triaged",
          triageStatus: "unknown",
          lifecycleEvents: [{ status: "triaged", at: "bad", source: "legacy" }],
        },
      ]),
    );

    expect(listMyResponseHistory()[0]).toMatchObject({
      lifecycleStatus: "received",
      triageStatus: undefined,
      roadmapStatus: undefined,
      lifecycleEvents: [
        {
          status: "received",
          source: "sender",
        },
      ],
    });
  });

  it("keeps storage status separate from review lifecycle", () => {
    expect(lifecycleStatusFromTriageStatus("investigating", "submitted")).toBe("reviewing");
    expect(lifecycleStatusFromTriageStatus("fixed", "submitted")).toBe("completed");
    expect(lifecycleStatusFromTriageStatus(undefined, "failed")).toBe("submitted");
    expect(
      lifecycleStatusFromSubmissionState({
        triageStatus: "new",
        reviewStatus: "read",
        storageStatus: "submitted",
      }),
    ).toBe("reviewing");
  });

  it("merges local submission triage into the sender-side lifecycle", () => {
    const merged = mergeMyResponseLifecycleFromSubmission(buildEntry(), {
      id: "submission-1",
      triageStatus: "in_progress",
      updatedAt: "2026-05-02T00:00:00.000Z",
    });

    expect(merged).toMatchObject({
      status: "submitted",
      triageStatus: "in_progress",
      roadmapStatus: "in_progress",
      lifecycleStatus: "in_progress",
      lifecycleUpdatedAt: "2026-05-02T00:00:00.000Z",
    });
  });

  it("updates an existing sender receipt when admin triage changes locally", () => {
    upsertMyResponseHistoryEntry(buildEntry());

    expect(
      updateMyResponseLifecycleFromSubmission({
        id: "submission-1",
        triageStatus: "fixed",
        updatedAt: "2026-05-03T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(listMyResponseHistory()[0]).toMatchObject({
      status: "submitted",
      triageStatus: "fixed",
      roadmapStatus: "fixed",
      lifecycleStatus: "completed",
    });
    expect(listMyResponseHistory()[0].lifecycleEvents?.map((event) => event.status)).toEqual([
      "received",
      "completed",
    ]);
  });

  it("updates an existing sender receipt when admin marks the signal read", () => {
    upsertMyResponseHistoryEntry(buildEntry());

    updateMyResponseLifecycleFromSubmission({
      id: "submission-1",
      status: "read",
      triageStatus: "new",
      updatedAt: "2026-05-03T00:00:00.000Z",
    });

    expect(listMyResponseHistory()[0]).toMatchObject({
      status: "submitted",
      reviewStatus: "read",
      triageStatus: "new",
      lifecycleStatus: "reviewing",
    });
    expect(listMyResponseHistory()[0].lifecycleEvents?.map((event) => event.status)).toEqual([
      "received",
      "reviewing",
    ]);
  });

  it("records multiple lifecycle transitions without duplicating repeated states", () => {
    upsertMyResponseHistoryEntry(buildEntry());
    updateMyResponseLifecycleFromSubmission({
      id: "submission-1",
      status: "read",
      triageStatus: "new",
      updatedAt: "2026-05-03T00:00:00.000Z",
    });
    updateMyResponseLifecycleFromSubmission({
      id: "submission-1",
      status: "read",
      triageStatus: "new",
      updatedAt: "2026-05-03T00:01:00.000Z",
    });
    updateMyResponseLifecycleFromSubmission({
      id: "submission-1",
      status: "read",
      triageStatus: "planned",
      updatedAt: "2026-05-04T00:00:00.000Z",
    });

    expect(listMyResponseHistory()[0].lifecycleEvents).toMatchObject([
      { status: "received", source: "sender" },
      { status: "reviewing", source: "admin" },
      { status: "planned", source: "admin" },
    ]);
  });

  it("does not create a sender receipt for unrelated admin-only submissions", () => {
    expect(
      updateMyResponseLifecycleFromSubmission({
        id: "submission-missing",
        triageStatus: "planned",
        updatedAt: "2026-05-03T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(listMyResponseHistory()).toEqual([]);
  });
});
