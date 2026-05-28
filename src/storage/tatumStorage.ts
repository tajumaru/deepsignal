import { SUI_NETWORK } from "../lib/sui";
import { createWalrusBlobProof } from "../lib/walrusProof";
import type { TatumStorageRecord, WalrusBlobProof } from "../types";
import {
  createTatumStorageClient,
  getTatumStorageRelayBaseUrl,
  getTatumStorageSafetyDiagnostics,
  isTatumStorageFeatureEnabled,
  type TatumUploadKind,
} from "./tatumClient";

export type { TatumUploadKind } from "./tatumClient";

export type TatumUploadResult = {
  blobId: string;
  tatumStorage: TatumStorageRecord;
  walrusProof: WalrusBlobProof;
};

export function isTatumStorageEnabled() {
  return isTatumStorageFeatureEnabled();
}

export function getTatumStorageWriteUrl() {
  return getTatumStorageRelayBaseUrl();
}

export { getTatumStorageSafetyDiagnostics };

export async function uploadWithTatum(body: Blob | File, kind: TatumUploadKind): Promise<TatumUploadResult> {
  const client = createTatumStorageClient();
  const created = await client.uploadFile(body, kind);
  const certified = await client.waitForCertification(created);
  const blobId = certified.blobId;
  if (!blobId) {
    throw new Error("Tatum storage certification response did not include a blobId.");
  }
  return {
    blobId,
    tatumStorage: {
      provider: "tatum",
      jobId: certified.jobId,
      blobId,
      cid: certified.cid,
      quiltId: certified.quiltId,
      quiltPatchId: certified.quiltPatchId,
      fileId: certified.fileId,
      status: certified.status,
      downloadUrl: certified.downloadUrl,
      noRenewal: certified.noRenewal,
    },
    walrusProof: createWalrusBlobProof({
      blobId,
      size: body.size,
      epoch: Number(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS || "5"),
      network: SUI_NETWORK,
    }),
  };
}

export async function getTatumUploadStatus(jobId: string) {
  return createTatumStorageClient().getUploadStatus(jobId);
}

export async function cancelTatumStorageRenewal(jobId: string, options: { instant?: boolean } = {}) {
  return createTatumStorageClient().cancelRenewal(jobId, options);
}
