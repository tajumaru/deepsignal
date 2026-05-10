import type { Submission } from "../types";

export function getEncryptedPayloadAvailabilityLabel(submission: Submission) {
  if (submission.encryptedBlobId) {
    return "Available as dedicated blob";
  }
  if (submission.encryptedPayload) {
    return "Encrypted payload stored in submission bundle";
  }
  return "Not available";
}

export function hasDedicatedEncryptedPayloadBlob(submission: Submission) {
  return Boolean(submission.encryptedBlobId);
}
