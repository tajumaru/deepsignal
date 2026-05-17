import { SUI_NETWORK, WALRUS_AGGREGATOR_URL } from "./sui";
import type { WalrusBlobProof, WalrusNetwork } from "../types";

export type WalrusVerificationStatus = "idle" | "verifying" | "verified" | "not-found" | "failed";

const WALRUSCAN_BASE_URL = "https://walruscan.com";

function getWalrusBlobGatewayUrl(blobId?: string) {
  if (
    !blobId ||
    blobId.startsWith("local-") ||
    blobId.startsWith("todo-") ||
    blobId.startsWith("walrus-form-") ||
    blobId.startsWith("walrus-submission-") ||
    blobId.startsWith("walrus-file-")
  ) {
    return null;
  }
  const aggregator = WALRUS_AGGREGATOR_URL.replace(/\/$/, "");
  return aggregator ? `${aggregator}/v1/blobs/${blobId}` : null;
}

export function getWalrusNetwork(network?: string | null): WalrusNetwork {
  return network === "mainnet" ? "mainnet" : "testnet";
}

export function getCurrentWalrusNetwork(): WalrusNetwork {
  return getWalrusNetwork(SUI_NETWORK);
}

export function shortenWalrusBlobId(blobId: string) {
  const value = blobId.trim();
  if (value.length <= 20) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

export function getWalrusExplorerUrl(blobId?: string | null, network?: WalrusNetwork | string | null) {
  if (!blobId?.trim()) {
    return null;
  }
  return `${WALRUSCAN_BASE_URL}/${getWalrusNetwork(network)}/blob/${encodeURIComponent(blobId.trim())}`;
}

export function createWalrusBlobProof({
  blobId,
  objectId,
  size,
  epoch,
  network = getCurrentWalrusNetwork(),
}: {
  blobId: string;
  objectId?: string;
  size?: number;
  epoch?: number;
  network?: WalrusNetwork;
}): WalrusBlobProof {
  return {
    blobId,
    objectId,
    size,
    epoch,
    network,
  };
}

export async function verifyWalrusBlob(blobId: string): Promise<WalrusVerificationStatus> {
  const url = getWalrusBlobGatewayUrl(blobId);
  if (!url) {
    return "failed";
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-0",
      },
      signal: controller.signal,
    });
    if (response.status === 404) {
      return "not-found";
    }
    return response.ok || response.status === 206 ? "verified" : "failed";
  } catch {
    return "failed";
  } finally {
    window.clearTimeout(timeout);
  }
}
