import { shortAddress } from "../lib/sui";
import { isValidSuiAddress } from "../lib/suiAddress";
import { useSuiName } from "./useSuiName";

function normalizeReviewerValue(value?: string | null) {
  return value?.trim() ?? "";
}

export function useReviewerDisplayLabel(reviewer?: string | null) {
  const normalizedReviewer = normalizeReviewerValue(reviewer);
  const isWalletAddress = normalizedReviewer ? isValidSuiAddress(normalizedReviewer) : false;
  const { data: suinsName } = useSuiName(isWalletAddress ? normalizedReviewer : null, {
    enabled: isWalletAddress,
  });

  if (!normalizedReviewer) {
    return "";
  }

  if (!isWalletAddress) {
    return normalizedReviewer;
  }

  return suinsName ?? shortAddress(normalizedReviewer);
}
