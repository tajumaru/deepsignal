import type { Submission } from "../types";

export function getEncryptedPayloadAvailabilityLabel(submission: Submission) {
  if (submission.encryptedBlobId) {
    return "Available as dedicated blob";
  }
  if (submission.encryptedPayload) {
    return "Embedded in submission payload";
  }
  return "Not available";
}
