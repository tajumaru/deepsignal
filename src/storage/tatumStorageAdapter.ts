import { WALRUS_AGGREGATOR_URL } from "../lib/sui";
import {
  cancelTatumStorageRenewal,
  getTatumStorageSafetyDiagnostics,
  getTatumStorageWriteUrl,
  getTatumUploadStatus,
  isTatumStorageEnabled,
  uploadWithTatum,
  type TatumUploadKind,
} from "./tatumStorage";

export type TatumStorageAdapterUploadResult = Awaited<ReturnType<typeof uploadWithTatum>> & {
  url?: string;
};

function getWalrusBlobUrl(blobId: string) {
  const aggregatorUrl = WALRUS_AGGREGATOR_URL.replace(/\/$/, "");
  return aggregatorUrl ? `${aggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}` : null;
}

export const tatumStorageAdapter = {
  provider: "tatum" as const,
  isEnabled: isTatumStorageEnabled,
  getWriteUrl: getTatumStorageWriteUrl,
  getSafetyDiagnostics: getTatumStorageSafetyDiagnostics,
  async uploadFile(file: File, kind: TatumUploadKind = "attachment"): Promise<TatumStorageAdapterUploadResult> {
    const result = await uploadWithTatum(file, kind);
    return {
      ...result,
      url: getWalrusBlobUrl(result.blobId) ?? undefined,
    };
  },
  getUploadStatus: getTatumUploadStatus,
  cancelRenewal: cancelTatumStorageRenewal,
};
