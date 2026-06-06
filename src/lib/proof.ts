import { getBlobViewerUrl } from "../storage/blobViewer";

export type ProofStorageMode = "Walrus" | "Local fallback";

export function isLocalFallbackBlob(blobId?: string | null) {
  return Boolean(blobId && blobId.startsWith("local-"));
}

export function getProofStorageMode(blobIds: Array<string | null | undefined>): ProofStorageMode {
  return blobIds.some((blobId) => isLocalFallbackBlob(blobId)) ? "Local fallback" : "Walrus";
}

export function getProofBlobUrl(blobId?: string | null) {
  if (!blobId || isLocalFallbackBlob(blobId)) {
    return null;
  }
  return getBlobViewerUrl(blobId);
}
