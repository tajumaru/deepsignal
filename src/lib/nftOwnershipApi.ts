import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  breakdownStructType,
  checkOwnedNftsForClient,
  type NftOwnershipCheckResult,
  type NftOwnershipDiagnostic,
} from "./nftOwnership";

function normalizeSuiAddress(value: unknown) {
  const address = typeof value === "string" ? value.trim() : "";
  const hex = address.startsWith("0x") || address.startsWith("0X") ? address.slice(2) : address;
  if (!hex || hex.length > 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return address;
  }
  return `0x${hex.toLowerCase().padStart(64, "0")}`;
}

function isValidSuiAddress(value: unknown) {
  const address = typeof value === "string" ? value.trim() : "";
  return normalizeSuiAddress(address).startsWith("0x") && normalizeSuiAddress(address).length === 66;
}

export type NftOwnershipCheckApiRequest = {
  address: string;
  network: "sui-mainnet" | "sui-testnet";
  requiredTypes: string[];
  requiredObjectIds?: string[];
};

export type NftOwnershipCheckApiSuccess = {
  ok: true;
  hasRequiredNft: boolean;
  matchedCount: number;
  directOwnedCount: number;
  kioskCount: number;
  kioskItemCount: number;
  matchedDirectObjects: NftOwnershipCheckResult["matchedDirectObjects"];
  matchedKioskItems: NftOwnershipCheckResult["matchedKioskItems"];
  diagnostic: NftOwnershipDiagnostic;
};

export type NftOwnershipCheckApiError = {
  ok: false;
  error: string;
  diagnostic?: Partial<NftOwnershipDiagnostic>;
};

export type NftOwnershipCheckApiResponse = NftOwnershipCheckApiSuccess | NftOwnershipCheckApiError;

type CachedOwnershipApiEntry = {
  expiresAt: number;
  promise: Promise<NftOwnershipCheckApiResponse>;
};

const OWNERSHIP_API_CACHE_TTL_MS = 60_000;
const ownershipApiCache = new Map<string, CachedOwnershipApiEntry>();

export function normalizeOwnershipApiRequest(raw: unknown): NftOwnershipCheckApiRequest {
  const input = raw && typeof raw === "object" ? (raw as Partial<NftOwnershipCheckApiRequest>) : {};
  const address = typeof input.address === "string" ? input.address.trim() : "";
  const network = input.network === "sui-testnet" ? "sui-testnet" : "sui-mainnet";
  const requiredTypes = Array.isArray(input.requiredTypes)
    ? input.requiredTypes.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : [];
  const requiredObjectIds = Array.isArray(input.requiredObjectIds)
    ? input.requiredObjectIds.filter((value): value is string => typeof value === "string").map((value) => normalizeSuiAddress(value)).filter(Boolean)
    : [];

  if (!address || !isValidSuiAddress(normalizeSuiAddress(address))) {
    throw new Error("A valid Sui address is required.");
  }
  if (requiredTypes.length === 0 && requiredObjectIds.length === 0) {
    throw new Error("At least one target type or object id is required.");
  }

  return {
    address: normalizeSuiAddress(address),
    network,
    requiredTypes,
    requiredObjectIds,
  };
}

export async function runNftOwnershipCheckApi(
  rawRequest: unknown,
  rpcInput: string | string[],
): Promise<NftOwnershipCheckApiResponse> {
  const request = normalizeOwnershipApiRequest(rawRequest);
  const rpcUrls = [...new Set((Array.isArray(rpcInput) ? rpcInput : [rpcInput]).map((value) => value.trim()).filter(Boolean))];
  if (rpcUrls.length === 0) {
    return {
      ok: false,
      error: "Server RPC URL is not configured.",
      diagnostic: {
        connectedAddress: request.address,
        network: request.network,
        rpcEndpoint: "",
        targetTypes: request.requiredTypes,
        targetObjectIds: request.requiredObjectIds ?? [],
        directOwnedCount: 0,
        kioskCount: 0,
        kioskItemCount: 0,
        directOwnedPages: [],
        kioskPages: [],
        directOwnedTypes: [],
        kioskItemTypes: [],
        kioskItemsByKiosk: [],
        requiredTypeBreakdown: [],
        typeComparisons: [],
        matchedDirectObjects: [],
        matchedKioskItems: [],
        sampleObjectTypes: [],
        ownershipChecks: [],
        zeroCountReason: "server_rpc_url_missing",
      },
    };
  }

  const cacheKey = `${rpcUrls.join("|")}::${request.network}::${request.address}::${request.requiredTypes.join("||")}::${(request.requiredObjectIds ?? []).join("||")}`;
  const now = Date.now();
  const cached = ownershipApiCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = (async (): Promise<NftOwnershipCheckApiResponse> => {
    let lastError: unknown;

    for (const rpcUrl of rpcUrls) {
      const client = new SuiJsonRpcClient({
        network: request.network === "sui-mainnet" ? "mainnet" : "testnet",
        url: rpcUrl,
      });

      try {
        const result = await checkOwnedNftsForClient(
          client,
          request.address,
          request.requiredTypes,
          request.network,
          rpcUrl,
          request.requiredObjectIds ?? [],
        );
        if (!result.hasRequiredNft) {
          ownershipApiCache.delete(cacheKey);
        }
        return {
          ok: true,
          hasRequiredNft: result.hasRequiredNft,
          matchedCount: result.matchedCount,
          directOwnedCount: result.directOwnedCount,
          kioskCount: result.kioskCount,
          kioskItemCount: result.kioskItemCount,
          matchedDirectObjects: result.matchedDirectObjects,
          matchedKioskItems: result.matchedKioskItems,
          diagnostic: result.diagnostic,
        };
      } catch (error) {
        lastError = error;
      }
    }

    ownershipApiCache.delete(cacheKey);
    return {
      ok: false,
      error: lastError instanceof Error ? lastError.message : "NFT ownership check failed.",
      diagnostic: {
        connectedAddress: request.address,
        network: request.network,
        rpcEndpoint: rpcUrls.join(" -> "),
        targetTypes: request.requiredTypes,
        targetObjectIds: request.requiredObjectIds ?? [],
        directOwnedCount: 0,
        kioskCount: 0,
        kioskItemCount: 0,
        directOwnedPages: [],
        kioskPages: [],
        directOwnedTypes: [],
        kioskItemTypes: [],
        kioskItemsByKiosk: [],
        requiredTypeBreakdown: request.requiredTypes.map((value) => breakdownStructType(value)),
        typeComparisons: [],
        matchedDirectObjects: [],
        matchedKioskItems: [],
        sampleObjectTypes: [],
        ownershipChecks: [],
        zeroCountReason: "rpc_error_before_ownership_match",
      },
    };
  })();

  ownershipApiCache.set(cacheKey, {
    expiresAt: now + OWNERSHIP_API_CACHE_TTL_MS,
    promise,
  });

  return promise;
}
