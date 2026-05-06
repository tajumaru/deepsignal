export function makeAnonymousContributorId() {
  return `anonymous-${Math.random().toString(36).slice(2, 8)}`;
}

export function shortenContributorId(contributorId?: string | null) {
  if (!contributorId) {
    return "Anonymous";
  }
  if (contributorId.startsWith("anonymous-")) {
    return contributorId;
  }
  if (contributorId.length <= 14) {
    return contributorId;
  }
  return `${contributorId.slice(0, 6)}...${contributorId.slice(-4)}`;
}
