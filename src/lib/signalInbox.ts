import { getBlobViewerUrl } from "../storage/storageFactory";
import { flattenAnswer } from "./utils";
import type { FormSchema, Submission } from "../types";

export type SignalCategory = "Bug" | "Feature" | "Praise" | "General" | "Unknown";

export function getSignalSubject(submission: Submission) {
  return submission.subjectPreview?.trim() || `Signal ${submission.id.slice(0, 8)}`;
}

export function getSignalPreview(submission: Submission) {
  if (submission.isEncrypted) {
    return "Encrypted Signal";
  }
  const values = Object.values(submission.answers ?? {});
  for (const value of values) {
    const preview = flattenAnswer(value).trim();
    if (preview) {
      return preview;
    }
  }
  return getSignalSubject(submission);
}

export function inferSignalCategory(submission: Submission): SignalCategory {
  try {
    const haystack = [
      submission.subjectPreview,
      ...Object.values(submission.answers ?? {}).map((value) => flattenAnswer(value)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack.trim()) {
      return "Unknown";
    }
    if (/\b(bug|crash|error|broken)\b/.test(haystack)) {
      return "Bug";
    }
    if (/\b(feature|request|want|idea)\b/.test(haystack)) {
      return "Feature";
    }
    if (/\b(love|good|great|thanks)\b/.test(haystack)) {
      return "Praise";
    }
    return "General";
  } catch {
    return "Unknown";
  }
}

export function isLocalFallbackBlob(blobId?: string | null) {
  if (!blobId) {
    return false;
  }
  return !getBlobViewerUrl(blobId);
}

export function getStorageBadgeLabel(blobId?: string | null) {
  if (!blobId) {
    return "Not available";
  }
  return isLocalFallbackBlob(blobId) ? "Local fallback" : "Stored on Walrus";
}

export function getWalletAccessLabel(form: FormSchema, currentAddress?: string | null) {
  if (!form.ownerAddress) {
    return "Legacy demo form";
  }
  if (
    currentAddress &&
    form.ownerAddress.toLowerCase() === currentAddress.toLowerCase()
  ) {
    return "Wallet Verified";
  }
  return "Access Denied";
}
