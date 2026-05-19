import { getBlobViewerUrl } from "../storage/storageFactory";
import { flattenAnswer } from "./utils";
import type { FormSchema, Submission } from "../types";

export type SignalCategory = "Bug" | "Feature" | "Survey" | "Praise" | "General" | "Unknown";
export type SignalPersistenceState =
  | "onchain_registered"
  | "pending_onchain"
  | "walrus_synced"
  | "local_only"
  | "not_available";
export type SignalStorageState = "walrus_synced" | "local_only" | "not_available";

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
  if (submission.category === "bug") {
    return "Bug";
  }
  if (submission.category === "feature") {
    return "Feature";
  }
  if (submission.category === "survey") {
    return "Survey";
  }
  if (submission.category === "general") {
    return "General";
  }

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

export function getSignalStorageBlobId(submission: Submission) {
  return submission.encryptedBlobId ?? submission.receiptBlobId ?? submission.blobId ?? null;
}

export function getSignalStorageState(submission: Submission): SignalStorageState {
  const blobId = getSignalStorageBlobId(submission);
  if (blobId && !isLocalFallbackBlob(blobId)) {
    return "walrus_synced";
  }
  if (blobId || submission.encryptedPayload) {
    return "local_only";
  }
  return "not_available";
}

export function getSignalPersistenceState(submission: Submission): SignalPersistenceState {
  if (typeof submission.onchainSignalId === "number") {
    return "onchain_registered";
  }
  if (submission.pendingOnchainRegistration) {
    return "pending_onchain";
  }
  return getSignalStorageState(submission);
}

export function getSignalPersistenceLabel(state: SignalPersistenceState) {
  switch (state) {
    case "onchain_registered":
      return "Registered on Sui";
    case "pending_onchain":
      return "Pending Sui registration";
    case "walrus_synced":
      return "Stored on Walrus";
    case "local_only":
      return "Stored locally only";
    default:
      return "Not available";
  }
}

export function getSignalSyncSummary(submission: Submission) {
  const storageState = getSignalStorageState(submission);
  const registrationState =
    typeof submission.onchainSignalId === "number"
      ? "onchain_registered"
      : submission.pendingOnchainRegistration
        ? "pending_onchain"
        : "not_available";

  const labels = [
    storageState === "walrus_synced"
      ? "Stored on Walrus"
      : storageState === "local_only"
        ? "Stored locally only"
        : null,
    registrationState === "onchain_registered"
      ? "Registered on Sui"
      : registrationState === "pending_onchain"
        ? "Pending Sui registration"
        : null,
  ].filter(Boolean);

  return labels.length > 0 ? labels.join(" / ") : "Not available";
}

export function getStorageBadgeLabel(blobId?: string | null) {
  if (!blobId) {
    return "Not available";
  }
  return isLocalFallbackBlob(blobId) ? "Stored locally only" : "Stored on Walrus";
}

export function getStorageDetailLabels(blobId?: string | null) {
  if (!blobId) {
    return [];
  }
  if (!isLocalFallbackBlob(blobId)) {
    return ["Stored on Walrus"];
  }
  return [
    "Stored locally only",
    "Walrus upload failed or not configured",
    "This is demo/local fallback data",
  ];
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
