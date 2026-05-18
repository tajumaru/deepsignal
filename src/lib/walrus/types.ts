import type { WalrusActualCost, WalrusBlobProof, WalrusNetwork } from "../../types";

export type WalrusBlobId = string;
export type WalrusObjectId = string;
export type SuiTransactionDigest = string;

export interface WalrusBlobReference {
  blobId: WalrusBlobId;
  objectId?: WalrusObjectId;
  transactionDigest?: SuiTransactionDigest;
  proof?: WalrusBlobProof;
  actualCost?: WalrusActualCost;
}

export interface WalrusUploadResult extends WalrusBlobReference {
  url?: string;
}

export interface WalrusReadOptions {
  as?: "blob" | "text" | "json";
}

export type { WalrusActualCost, WalrusBlobProof, WalrusNetwork };
