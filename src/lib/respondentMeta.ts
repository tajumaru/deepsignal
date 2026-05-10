import type { RespondentMeta, Submission } from "../types";

export function getSubmissionRespondentMeta(submission: Submission): RespondentMeta {
  const legacyAnonymous =
    !submission.contributorId || submission.contributorId.startsWith("anonymous-");
  return {
    walletAddress:
      submission.respondentMeta?.walletAddress ??
      (legacyAnonymous ? undefined : submission.contributorId),
    chain: submission.respondentMeta?.chain ?? "sui",
    sessionId: submission.respondentMeta?.sessionId,
    submittedAt: submission.respondentMeta?.submittedAt ?? submission.createdAt,
    isAnonymous: submission.respondentMeta?.isAnonymous ?? legacyAnonymous,
  };
}

export function getRespondentDisplayLabel(submission: Submission) {
  const meta = getSubmissionRespondentMeta(submission);
  if (meta.isAnonymous || !meta.walletAddress) {
    return "Anonymous respondent";
  }
  return meta.walletAddress;
}
