import { walrusAdapter } from "../../storage/walrusAdapter";
import {
  fetchJsonBlob,
  readJsonBlobOrThrow,
  readManifest,
  readManifestWithForm,
  saveManifest,
  WalrusBlobReadError,
  type WalrusBlobReadErrorCode,
} from "../../storage/walrusAdapter";
import type { SignalManifest } from "../../types";
import type { WalrusUploadResult } from "./types";

export async function uploadBlob(blob: Blob | File, fileName = "walrus-blob"): Promise<WalrusUploadResult> {
  const file =
    blob instanceof File
      ? blob
      : new File([blob], fileName, { type: blob.type || "application/octet-stream" });
  const uploaded = await walrusAdapter.uploadFile(file);
  return {
    blobId: uploaded.blobId,
    proof: uploaded.walrusProof,
    objectId: uploaded.walrusProof?.objectId,
    url: uploaded.url,
  };
}

export async function readBlob(blobId: string): Promise<Blob | null> {
  return walrusAdapter.readFileBlob(blobId);
}

export async function readTextBlob(blobId: string): Promise<string | null> {
  return walrusAdapter.readFileText(blobId);
}

export async function uploadJsonBlob<T>(payload: T, fileName = "payload.json") {
  return uploadBlob(
    new Blob([JSON.stringify(payload)], {
      type: "application/json",
    }),
    fileName,
  );
}

export {
  fetchJsonBlob,
  readJsonBlobOrThrow,
  readManifest,
  readManifestWithForm,
  saveManifest,
  WalrusBlobReadError,
  type SignalManifest,
  type WalrusBlobReadErrorCode,
};

export type * from "./types";
export * from "./walrusClient";
