import { describe, expect, it } from "vitest";
import { NoopMemoryAdapter, noopMemoryAdapter } from "./noopMemoryAdapter";

describe("noopMemoryAdapter", () => {
  it("reports disabled runtime status", () => {
    expect(noopMemoryAdapter.getRuntimeStatus()).toMatchObject({
      kind: "noop",
      enabled: false,
      configured: false,
      reason: "disabled",
    });
  });

  it("can be constructed as a no-op implementation", () => {
    expect(new NoopMemoryAdapter().kind).toBe("noop");
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
    ).resolves.toEqual({ ok: false, skipped: true, reason: "disabled" });

    await expect(
      noopMemoryAdapter.recallReviewMemory({
        formId: "form-1",
        submissionId: "submission-1",
        query: "Safari upload retries",
      }),
    ).resolves.toEqual({ ok: false, skipped: true, reason: "disabled", matches: [] });
  });
});
