import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { kiosk } from "@mysten/kiosk";
import { normalizeStructTag } from "@mysten/sui/utils";
import { isSuiRateLimitError } from "./rpcErrors";

export type OwnedObjectEntry = {
  data?: {
    objectId?: string;
    type?: string;
    owner?: unknown;
    content?: {
      dataType?: string;
      fields?: Record<string, unknown>;
    } | null;
  } | null;
};

type OwnedObjectsResponse = {
  data?: OwnedObjectEntry[];
  hasNextPage?: boolean;
  nextCursor?: string | null;
};

type OwnedObjectsRequest = {
  owner: string;
  cursor?: string;
  filter?: {
    StructType: string;
  };
  options?: {
    showType?: boolean;
    showContent?: boolean;
    showOwner?: boolean;
  };
  limit?: number;
};

type OwnedObjectsClient = {
  getOwnedObjects: (request: OwnedObjectsRequest) => Promise<unknown>;
  $extend?: SuiJsonRpcClient["$extend"] | ((...extensions: unknown[]) => unknown);
};

export type MatchedOwnedObject = {
  objectId: string;
  type: string;
};

export type MatchedKioskItem = {
  objectId: string;
  kioskId: string;
  type: string;
  isLocked: boolean;
};

export type NftOwnershipDiagnostic = {
  connectedAddress: string;
  network: string;
  targetTypes: string[];
  directOwnedCount: number;
  kioskCount: number;
  kioskItemCount: number;
  matchedDirectObjects: MatchedOwnedObject[];
  matchedKioskItems: MatchedKioskItem[];
  sampleObjectTypes: string[];
};

export type NftOwnershipCheckResult = {
  hasRequiredNft: boolean;
  matchedCount: number;
  directOwnedCount: number;
  kioskCount: number;
  kioskItemCount: number;
  matchedDirectObjects: MatchedOwnedObject[];
  matchedKioskItems: MatchedKioskItem[];
  diagnostic: NftOwnershipDiagnostic;
};

type OwnedKiosksResponse = {
  kioskIds: string[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

type KioskQueryClient = {
  kiosk: {
    getOwnedKiosks: (input: {
      address: string;
      pagination?: {
        cursor?: string | null;
        limit?: number;
      };
    }) => Promise<OwnedKiosksResponse>;
    getKiosk: (input: {
      id: string;
      options?: {
        withObjects?: boolean;
      };
    }) => Promise<{
      items?: Array<{
        objectId: string;
        kioskId: string;
        type: string;
        isLocked: boolean;
        data?: {
          type?: string;
        };
      }>;
    }>;
  };
};

type OwnedKioskItem = {
  objectId: string;
  kioskId: string;
  type: string;
  isLocked: boolean;
};

const RPC_RETRY_ATTEMPTS = 4;
const RPC_RETRY_BASE_DELAY_MS = 250;
const KIOSK_FETCH_BATCH_SIZE = 4;

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryRpcCall<T>(task: () => Promise<T>, label: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RPC_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isSuiRateLimitError(error) || attempt === RPC_RETRY_ATTEMPTS) {
        break;
      }
      const delayMs = RPC_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`[nft-ownership] rate limited during ${label}; retrying in ${delayMs}ms`, {
        attempt,
        maxAttempts: RPC_RETRY_ATTEMPTS,
      });
      await wait(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`RPC request failed during ${label}.`);
}

function uniqueObjectEntries(entries: OwnedObjectEntry[]) {
  return entries.reduce<OwnedObjectEntry[]>((unique, entry) => {
    const objectId = entry.data?.objectId?.trim();
    if (!objectId || unique.some((candidate) => candidate.data?.objectId?.trim() === objectId)) {
      return unique;
    }
    unique.push(entry);
    return unique;
  }, []);
}

export function normalizeSuiTypeName(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  try {
    return normalizeStructTag(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }
}

export function matchesOwnedObjectType(actualType: string | undefined, requiredType: string) {
  const normalizedActualType = normalizeSuiTypeName(actualType);
  const normalizedRequiredType = normalizeSuiTypeName(requiredType);
  if (!normalizedActualType || !normalizedRequiredType) {
    return false;
  }
  return normalizedActualType === normalizedRequiredType;
}

export function filterOwnedObjectsByType(entries: OwnedObjectEntry[], requiredTypes: string[]) {
  const normalizedRequiredTypes = new Set(requiredTypes.map((value) => normalizeSuiTypeName(value)).filter(Boolean));
  if (normalizedRequiredTypes.size === 0) {
    return entries;
  }
  return entries.filter((entry) => normalizedRequiredTypes.has(normalizeSuiTypeName(entry.data?.type)));
}

export async function fetchAllOwnedSuiObjectsForClient(suiClient: OwnedObjectsClient, owner: string) {
  const matches: OwnedObjectEntry[] = [];
  let cursor: string | null | undefined = null;

  do {
    const page = (await retryRpcCall(
      () =>
        suiClient.getOwnedObjects({
          owner,
          cursor: cursor ?? undefined,
          options: {
            showType: true,
            showContent: true,
            showOwner: true,
          },
          limit: 50,
        }),
      "getOwnedObjects(all)",
    )) as OwnedObjectsResponse;
    matches.push(...(page.data ?? []));
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  return uniqueObjectEntries(matches);
}

export async function fetchOwnedSuiObjectsForClient(
  suiClient: OwnedObjectsClient,
  owner: string,
  structTypes: string[] = [],
) {
  const normalizedStructTypes = uniqueStrings(structTypes.map((value) => value.trim()));
  const matches: OwnedObjectEntry[] = [];
  const queryStructTypes = normalizedStructTypes.length > 0 ? normalizedStructTypes : [""];

  for (const structType of queryStructTypes) {
    let cursor: string | null | undefined = null;

    do {
      const request: OwnedObjectsRequest = {
        owner,
        cursor: cursor ?? undefined,
        options: {
          showType: true,
          showContent: true,
          showOwner: true,
        },
        limit: 50,
      };
      if (structType) {
        request.filter = { StructType: structType };
      }
      const page = (await retryRpcCall(
        () => suiClient.getOwnedObjects(request),
        structType ? `getOwnedObjects(${structType})` : "getOwnedObjects(filtered)",
      )) as OwnedObjectsResponse;
      matches.push(...(page.data ?? []));
      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);
  }

  return uniqueObjectEntries(matches);
}

async function fetchOwnedKioskItemsForClient(suiClient: OwnedObjectsClient, owner: string) {
  if (typeof suiClient.$extend !== "function") {
    return {
      kioskIds: [] as string[],
      items: [] as OwnedKioskItem[],
    };
  }

  const kioskClient = suiClient.$extend(kiosk()) as KioskQueryClient;
  const kioskIds = new Set<string>();
  let cursor: string | null = null;

  do {
    const response = await retryRpcCall(
      () =>
        kioskClient.kiosk.getOwnedKiosks({
          address: owner,
          pagination: {
            cursor,
            limit: 50,
          },
        }),
      "getOwnedKiosks",
    );
    response.kioskIds.forEach((kioskId) => kioskIds.add(kioskId));
    cursor = response.hasNextPage ? response.nextCursor : null;
  } while (cursor);

  const kioskContents: Array<Awaited<ReturnType<KioskQueryClient["kiosk"]["getKiosk"]>>> = [];
  const kioskIdList = [...kioskIds];

  for (let index = 0; index < kioskIdList.length; index += KIOSK_FETCH_BATCH_SIZE) {
    const batch = kioskIdList.slice(index, index + KIOSK_FETCH_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((kioskId) =>
        retryRpcCall(
          () =>
            kioskClient.kiosk.getKiosk({
              id: kioskId,
              options: {
                withObjects: true,
              },
            }),
          `getKiosk(${kioskId})`,
        ),
      ),
    );
    kioskContents.push(...batchResults);
  }

  const items = kioskContents.flatMap((result) =>
    (result.items ?? []).map((item) => ({
      objectId: item.objectId,
      kioskId: item.kioskId,
      type: item.data?.type?.trim() || item.type?.trim() || "",
      isLocked: item.isLocked,
    })),
  );

  return {
    kioskIds: [...kioskIds],
    items,
  };
}

export async function checkOwnedNftsForClient(
  suiClient: OwnedObjectsClient,
  owner: string,
  requiredTypes: string[],
  network: string,
): Promise<NftOwnershipCheckResult> {
  const [directOwnedObjects, kioskResult] = await Promise.all([
    fetchAllOwnedSuiObjectsForClient(suiClient, owner),
    fetchOwnedKioskItemsForClient(suiClient, owner),
  ]);
  const matchedDirectObjects = filterOwnedObjectsByType(directOwnedObjects, requiredTypes)
    .map((entry) => ({
      objectId: entry.data?.objectId?.trim() ?? "",
      type: entry.data?.type?.trim() ?? "",
    }))
    .filter((entry) => entry.objectId && entry.type);
  const matchedKioskItems = kioskResult.items.filter((item) =>
    requiredTypes.some((requiredType) => matchesOwnedObjectType(item.type, requiredType)),
  );

  const diagnostic: NftOwnershipDiagnostic = {
    connectedAddress: owner,
    network,
    targetTypes: uniqueStrings(requiredTypes.map((value) => value.trim())),
    directOwnedCount: directOwnedObjects.length,
    kioskCount: kioskResult.kioskIds.length,
    kioskItemCount: kioskResult.items.length,
    matchedDirectObjects,
    matchedKioskItems,
    sampleObjectTypes: uniqueStrings([
      ...directOwnedObjects.map((entry) => entry.data?.type?.trim() ?? ""),
      ...kioskResult.items.map((item) => item.type.trim()),
    ]).slice(0, 20),
  };

  return {
    hasRequiredNft: matchedDirectObjects.length > 0 || matchedKioskItems.length > 0,
    matchedCount: matchedDirectObjects.length + matchedKioskItems.length,
    directOwnedCount: directOwnedObjects.length,
    kioskCount: kioskResult.kioskIds.length,
    kioskItemCount: kioskResult.items.length,
    matchedDirectObjects,
    matchedKioskItems,
    diagnostic,
  };
}

export async function hasRequiredNft(
  suiClient: OwnedObjectsClient,
  owner: string,
  requiredTypes: string[],
  network: string,
) {
  return checkOwnedNftsForClient(suiClient, owner, requiredTypes, network);
}
