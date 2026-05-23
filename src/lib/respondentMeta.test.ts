import { describe, expect, it } from "vitest";
import { getRespondentDisplayLabel, getSubmissionRespondentMeta, isVerifiedSignal } from "./respondentMeta";
import type { Submission } from "../types";

function createBaseSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    formId: "form-1",
    answers: {},
    attachments: [],
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("respondentMeta", () => {
  it("keeps older wallet-based submissions readable", () => {
    const submission = createBaseSubmission({
      contributorId: "0xabc123",
    });

    const meta = getSubmissionRespondentMeta(submission);

    expect(meta.isAnonymous).toBe(false);
    expect(meta.identityKind).toBe("sui_wallet");
    expect(meta.verifiedAddress).toBe("0xabc123");
    expect(getRespondentDisplayLabel(submission)).toBe("0xabc123");
    expect(isVerifiedSignal(submission)).toBe(true);
  });

  it("returns zkLogin derived addresses as the verified display identity", () => {
    const submission = createBaseSubmission({
      contributorId: "session-1",
      respondentMeta: {
        chain: "sui",
        submittedAt: new Date().toISOString(),
        isAnonymous: false,
        identityKind: "zklogin",
        identityProvider: "google",
        verifiedAddress: "0xzklogin123",
        zkLogin: {
          iss: "https://accounts.google.com",
          address: "0xzklogin123",
          legacyAddress: false,
          subHash: "hash",
        },
      },
    });

    const meta = getSubmissionRespondentMeta(submission);

    expect(meta.identityKind).toBe("zklogin");
    expect(meta.verifiedAddress).toBe("0xzklogin123");
    expect(meta.walletAddress).toBeUndefined();
    expect(getRespondentDisplayLabel(submission)).toBe("0xzklogin123");
    expect(isVerifiedSignal(submission)).toBe(true);
  });
});
