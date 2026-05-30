import { describe, expect, it } from "vitest";
import { noopMemoryAdapter } from "./noopMemoryAdapter";

describe("noopMemoryAdapter", () => {
  it("reports disabled runtime status", () => {
    expect(noopMemoryAdapter.getRuntimeStatus()).toMatchObject({
      mode: "disabled",
      enabled: false,
      configured: false,
    });
  });

  it("skips memory writes and recall without side effects", async () => {
    await expect(
      noopMemoryAdapter.rememberReviewMemory({
        formId: "form-1",
        submissionId: "submission-1",
        summary: "Operator noted a repeated upload failure.",
        evidence: ["Same symptom seen in earlier signal."],
        reviewedAt: "2026-05-30T00:00:00.000Z",
      }),
    ).resolves.toEqual({ status: "skipped", reason: "disabled" });

    await expect(
      noopMemoryAdapter.recallReviewMemory({
        form: {
          id: "form-1",
          title: "Signal intake",
        },
        submission: {
          id: "submission-1",
          formId: "form-1",
          tags: [],
          triageStatus: "new",
          priority: "medium",
        },
      }),
    ).resolves.toEqual({ status: "skipped", reason: "disabled", matches: [] });
  });
});
