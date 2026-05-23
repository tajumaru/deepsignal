import type { RespondentMeta, Submission } from "../types";

export function getSubmissionRespondentMeta(submission: Submission): RespondentMeta {
  const legacyAnonymous =
    !submission.contributorId || submission.contributorId.startsWith("anonymous-");
  const explicitIdentityKind = submission.respondentMeta?.identityKind;
  const explicitMeta = submission.respondentMeta;
  const walletAddress =
    explicitMeta?.walletAddress ??
    (legacyAnonymous || explicitIdentityKind === "zklogin" ? undefined : submission.contributorId);
  const verifiedAddress =
    explicitMeta?.verifiedAddress ??
    explicitMeta?.zkLogin?.address ??
    walletAddress;
  const identityKind =
    explicitMeta?.identityKind ??
    (explicitMeta?.zkLogin?.address
      ? "zklogin"
      : explicitMeta?.walletAddress
        ? "sui_wallet"
        : explicitMeta?.isAnonymous === true || legacyAnonymous
          ? "anonymous"
          : verifiedAddress
            ? "sui_wallet"
            : "anonymous");
  return {
    walletAddress,
    chain: explicitMeta?.chain ?? "sui",
    sessionId: explicitMeta?.sessionId,
    submittedAt: explicitMeta?.submittedAt ?? submission.createdAt,
    isAnonymous: explicitMeta?.isAnonymous ?? legacyAnonymous,
    identityKind,
    identityProvider: explicitMeta?.identityProvider,
    verifiedAddress,
    zkLogin: explicitMeta?.zkLogin,
  };
}

export function getRespondentDisplayLabel(submission: Submission) {
  const meta = getSubmissionRespondentMeta(submission);
  if (meta.isAnonymous || !meta.verifiedAddress) {
    return "Anonymous respondent";
  }
  return meta.verifiedAddress;
}

export function getRespondentIdentityLabel(submission: Submission) {
  const meta = getSubmissionRespondentMeta(submission);
  if (meta.isAnonymous) {
    return "Anonymous respondent";
  }
  if (meta.identityKind === "zklogin") {
    return meta.identityProvider === "google" ? "Google zkLogin" : "zkLogin";
  }
  return "Wallet verified";
}

export function isVerifiedSignal(submission: Submission) {
  const meta = getSubmissionRespondentMeta(submission);
  return !meta.isAnonymous && Boolean(meta.verifiedAddress);
}
