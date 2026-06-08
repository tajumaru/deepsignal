import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { isSuiRateLimitError } from "./rpcErrors";
import { normalizeSuiAddress } from "./suiAddress";
import {
  breakdownStructType,
  matchesOwnedObjectType,
  normalizeStructType,
  type OwnedObjectEntry,
  type StructTypeBreakdown,
} from "./nftOwnershipShared";

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

export type TypeComparisonDiagnostic = {
  source: "direct" | "kiosk";
  actualType: string;
  normalizedActualType: string;
  requiredType: string;
  normalizedRequiredType: string;
  matches: boolean;
  actualBreakdown: StructTypeBreakdown;
  requiredBreakdown: StructTypeBreakdown;
};

export type OwnedObjectsPageDiagnostic = {
  cursor: string | null;
  hasNextPage: boolean;
  nextCursor: string | null;
  resultCount: number;
};

export type KioskPageDiagnostic = {
  cursor: string | null;
  hasNextPage: boolean;
  nextCursor: string | null;
  kioskCount: number;
};

export type KioskItemDiagnostic = {
  kioskId: string;
  itemCount: number;
  itemTypes: string[];
};

export type OwnershipCheckDiagnostic = {
  source: "direct" | "kiosk";
  matchKind: "objectId" | "structType";
  expectedType: string;
  expectedObjectId: string;
  returnedType: string;
  objectId: string;
  kioskId: string | null;
  cursor: string | null;
  hasNextPage: boolean;
  network: string;
  rpcUrl: string;
  matched: boolean;
};

export type NftOwnershipDiagnostic = {
  connectedAddress: string;
  network: string;
  rpcEndpoint: string;
  targetTypes: string[];
  targetObjectIds: string[];
  directOwnedCount: number;
  kioskCount: number;
  kioskItemCount: number;
  directOwnedPages: OwnedObjectsPageDiagnostic[];
  kioskPages: KioskPageDiagnostic[];
  directOwnedTypes: string[];
  kioskItemTypes: string[];
  kioskItemsByKiosk: KioskItemDiagnostic[];
  requiredTypeBreakdown: StructTypeBreakdown[];
  typeComparisons: TypeComparisonDiagnostic[];
  matchedDirectObjects: MatchedOwnedObject[];
  matchedKioskItems: MatchedKioskItem[];
  sampleObjectTypes: string[];
  ownershipChecks: OwnershipCheckDiagnostic[];
  zeroCountReason: string;
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
  cursor: string | null;
  hasNextPage: boolean;
};

const RPC_RETRY_ATTEMPTS = 4;
const RPC_RETRY_BASE_DELAY_MS = 250;
const KIOSK_FETCH_BATCH_SIZE = 4;
const MAX_DEBUG_TYPES = 50;
const MAX_DEBUG_COMPARISONS = 50;

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

function normalizeObjectId(value: string | undefined | null) {
  return normalizeSuiAddress(value ?? "");
}

function uniqueOwnedKioskItems(items: OwnedKioskItem[]) {
  return items.reduce<OwnedKioskItem[]>((unique, item) => {
    const objectId = normalizeObjectId(item.objectId);
    if (!objectId || unique.some((candidate) => normalizeObjectId(candidate.objectId) === objectId)) {
      return unique;
    }
    unique.push({
      ...item,
      objectId,
    });
    return unique;
  }, []);
}

export async function fetchAllOwnedSuiObjectsForClient(suiClient: OwnedObjectsClient, owner: string) {
  const matches: OwnedObjectEntry[] = [];
  let cursor: string | null | undefined = null;
  const pageDiagnostics: OwnedObjectsPageDiagnostic[] = [];

  do {
    const requestCursor = cursor ?? null;
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
    pageDiagnostics.push({
      cursor: requestCursor,
      hasNextPage: Boolean(page.hasNextPage),
      nextCursor: page.nextCursor ?? null,
      resultCount: page.data?.length ?? 0,
    });
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  return {
    entries: uniqueObjectEntries(matches),
    pageDiagnostics,
  };
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
      pageDiagnostics: [] as KioskPageDiagnostic[],
      kioskItemsByKiosk: [] as KioskItemDiagnostic[],
    };
  }

  const { kiosk } = await import("@mysten/kiosk");
  const kioskClient = suiClient.$extend(kiosk()) as KioskQueryClient;
  const kioskIds = new Set<string>();
  let cursor: string | null = null;
  const pageDiagnostics: KioskPageDiagnostic[] = [];

  do {
    const requestCursor = cursor;
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
    pageDiagnostics.push({
      cursor: requestCursor,
      hasNextPage: response.hasNextPage,
      nextCursor: response.nextCursor ?? null,
      kioskCount: response.kioskIds.length,
    });
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
      cursor: null,
      hasNextPage: false,
    })),
  );
  const kioskItemsByKiosk = kioskIdList.map((kioskId) => {
    const itemTypes = uniqueStrings(
      items
        .filter((item) => item.kioskId === kioskId)
        .map((item) => item.type.trim()),
    ).slice(0, MAX_DEBUG_TYPES);
    return {
      kioskId,
      itemCount: items.filter((item) => item.kioskId === kioskId).length,
      itemTypes,
    };
  });

  return {
    kioskIds: [...kioskIds],
    items: uniqueOwnedKioskItems(items),
    pageDiagnostics,
    kioskItemsByKiosk,
  };
}

function buildTypeComparisons(args: {
  directOwnedObjects: OwnedObjectEntry[];
  kioskItems: OwnedKioskItem[];
  requiredTypes: string[];
}) {
  const requiredEntries = uniqueStrings(args.requiredTypes.map((value) => value.trim()))
    .map((requiredType) => ({
      requiredType,
      normalizedRequiredType: normalizeStructType(requiredType),
    }))
    .filter((entry) => entry.normalizedRequiredType);
  const comparisons: TypeComparisonDiagnostic[] = [];
  const seenKeys = new Set<string>();

  const pushComparisons = (source: "direct" | "kiosk", actualTypes: string[]) => {
    for (const actualType of actualTypes) {
      const normalizedActualType = normalizeStructType(actualType);
      for (const requiredEntry of requiredEntries) {
        const { normalizedRequiredType, requiredType } = requiredEntry;
        const key = `${source}::${normalizedActualType}::${normalizedRequiredType}`;
        if (!normalizedActualType || seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        comparisons.push({
          source,
          actualType,
          normalizedActualType,
          requiredType,
          normalizedRequiredType,
          matches: normalizedActualType === normalizedRequiredType,
          actualBreakdown: breakdownStructType(actualType),
          requiredBreakdown: breakdownStructType(requiredType),
        });
        if (comparisons.length >= MAX_DEBUG_COMPARISONS) {
          return;
        }
      }
    }
  };

  pushComparisons(
    "direct",
    uniqueStrings(args.directOwnedObjects.map((entry) => entry.data?.type?.trim() ?? "")).slice(0, MAX_DEBUG_TYPES),
  );
  if (comparisons.length < MAX_DEBUG_COMPARISONS) {
    pushComparisons(
      "kiosk",
      uniqueStrings(args.kioskItems.map((item) => item.type.trim())).slice(0, MAX_DEBUG_TYPES),
    );
  }

  return comparisons;
}

function buildOwnershipChecks(args: {
  directOwnedObjects: OwnedObjectEntry[];
  kioskItems: OwnedKioskItem[];
  requiredTypes: string[];
  requiredObjectIds: string[];
  network: string;
  rpcEndpoint: string;
}) {
  const checks: OwnershipCheckDiagnostic[] = [];
  const expectedTypes = uniqueStrings(args.requiredTypes.map((value) => value.trim()));
  const expectedObjectIds = uniqueStrings(args.requiredObjectIds.map((value) => normalizeObjectId(value)).filter(Boolean));

  for (const entry of args.directOwnedObjects) {
    const returnedType = entry.data?.type?.trim() ?? "";
    const objectId = normalizeObjectId(entry.data?.objectId);
    if (!objectId) {
      continue;
    }
    for (const expectedObjectId of expectedObjectIds) {
      checks.push({
        source: "direct",
        matchKind: "objectId",
        expectedType: "",
        expectedObjectId,
        returnedType,
        objectId,
        kioskId: null,
        cursor: null,
        hasNextPage: false,
        network: args.network,
        rpcUrl: args.rpcEndpoint,
        matched: objectId === expectedObjectId,
      });
    }
    for (const expectedType of expectedTypes) {
      checks.push({
        source: "direct",
        matchKind: "structType",
        expectedType,
        expectedObjectId: "",
        returnedType,
        objectId,
        kioskId: null,
        cursor: null,
        hasNextPage: false,
        network: args.network,
        rpcUrl: args.rpcEndpoint,
        matched: matchesOwnedObjectType(returnedType, expectedType),
      });
    }
  }

  for (const item of args.kioskItems) {
    const objectId = normalizeObjectId(item.objectId);
    if (!objectId) {
      continue;
    }
    for (const expectedObjectId of expectedObjectIds) {
      checks.push({
        source: "kiosk",
        matchKind: "objectId",
        expectedType: "",
        expectedObjectId,
        returnedType: item.type,
        objectId,
        kioskId: item.kioskId,
        cursor: item.cursor,
        hasNextPage: item.hasNextPage,
        network: args.network,
        rpcUrl: args.rpcEndpoint,
        matched: objectId === expectedObjectId,
      });
    }
    for (const expectedType of expectedTypes) {
      checks.push({
        source: "kiosk",
        matchKind: "structType",
        expectedType,
        expectedObjectId: "",
        returnedType: item.type,
        objectId,
        kioskId: item.kioskId,
        cursor: item.cursor,
        hasNextPage: item.hasNextPage,
        network: args.network,
        rpcUrl: args.rpcEndpoint,
        matched: matchesOwnedObjectType(item.type, expectedType),
      });
    }
  }

  return checks.slice(0, MAX_DEBUG_COMPARISONS * 4);
}

function selectMatchedObjects(args: {
  directOwnedObjects: OwnedObjectEntry[];
  kioskItems: OwnedKioskItem[];
  requiredTypes: string[];
  requiredObjectIds: string[];
}) {
  const matchedDirectObjects: MatchedOwnedObject[] = [];
  const matchedKioskItems: MatchedKioskItem[] = [];
  const seenDirectObjectIds = new Set<string>();
  const seenKioskObjectIds = new Set<string>();
  const normalizedRequiredObjectIds = new Set(
    uniqueStrings(args.requiredObjectIds.map((value) => normalizeObjectId(value)).filter(Boolean)),
  );
  const normalizedRequiredTypes = uniqueStrings(args.requiredTypes.map((value) => value.trim())).filter(Boolean);

  const pushDirect = (entry: OwnedObjectEntry) => {
    const objectId = normalizeObjectId(entry.data?.objectId);
    const type = entry.data?.type?.trim() ?? "";
    if (!objectId || seenDirectObjectIds.has(objectId)) {
      return;
    }
    seenDirectObjectIds.add(objectId);
    matchedDirectObjects.push({ objectId, type });
  };

  const pushKiosk = (item: OwnedKioskItem) => {
    const objectId = normalizeObjectId(item.objectId);
    if (!objectId || seenKioskObjectIds.has(objectId)) {
      return;
    }
    seenKioskObjectIds.add(objectId);
    matchedKioskItems.push({
      objectId,
      kioskId: item.kioskId,
      type: item.type,
      isLocked: item.isLocked,
    });
  };

  for (const entry of args.directOwnedObjects) {
    if (normalizedRequiredObjectIds.has(normalizeObjectId(entry.data?.objectId))) {
      pushDirect(entry);
    }
  }
  for (const entry of args.directOwnedObjects) {
    if (normalizedRequiredTypes.some((requiredType) => matchesOwnedObjectType(entry.data?.type, requiredType))) {
      pushDirect(entry);
    }
  }
  for (const item of args.kioskItems) {
    if (normalizedRequiredObjectIds.has(normalizeObjectId(item.objectId))) {
      pushKiosk(item);
    }
  }
  for (const item of args.kioskItems) {
    if (normalizedRequiredTypes.some((requiredType) => matchesOwnedObjectType(item.type, requiredType))) {
      pushKiosk(item);
    }
  }

  return {
    matchedDirectObjects,
    matchedKioskItems,
  };
}

function determineZeroCountReason(args: {
  requiredTypes: string[];
  requiredObjectIds: string[];
  directOwnedCount: number;
  kioskCount: number;
  kioskItemCount: number;
  matchedDirectObjects: MatchedOwnedObject[];
  matchedKioskItems: MatchedKioskItem[];
  typeComparisons: TypeComparisonDiagnostic[];
}) {
  if (args.matchedDirectObjects.length > 0 || args.matchedKioskItems.length > 0) {
    return "matched_required_type";
  }
  if (args.requiredTypes.length === 0 && args.requiredObjectIds.length === 0) {
    return "required_selector_missing";
  }
  if (args.directOwnedCount === 0 && args.kioskCount === 0) {
    return "no_direct_objects_and_no_kiosks_detected";
  }
  if (args.directOwnedCount === 0 && args.kioskItemCount > 0) {
    return "only_kiosk_items_detected_but_required_type_not_matched";
  }
  if (args.directOwnedCount > 0 && args.kioskItemCount === 0 && args.kioskCount === 0) {
    return "direct_objects_detected_but_required_type_not_matched";
  }
  if (args.typeComparisons.some((comparison) => comparison.matches)) {
    return "type_match_detected_but_matched_objects_missing";
  }
  return "types_detected_but_no_normalized_type_match";
}

export async function checkOwnedNftsForClient(
  suiClient: OwnedObjectsClient,
  owner: string,
  requiredTypes: string[],
  network: string,
  rpcEndpoint = "",
  requiredObjectIds: string[] = [],
): Promise<NftOwnershipCheckResult> {
  const [directOwnedResult, kioskResult] = await Promise.all([
    fetchAllOwnedSuiObjectsForClient(suiClient, owner),
    fetchOwnedKioskItemsForClient(suiClient, owner),
  ]);
  const directOwnedObjects = directOwnedResult.entries;
  const { matchedDirectObjects, matchedKioskItems } = selectMatchedObjects({
    directOwnedObjects,
    kioskItems: kioskResult.items,
    requiredTypes,
    requiredObjectIds,
  });
  const directOwnedTypes = uniqueStrings(
    directOwnedObjects.map((entry) => entry.data?.type?.trim() ?? ""),
  ).slice(0, MAX_DEBUG_TYPES);
  const kioskItemTypes = uniqueStrings(
    kioskResult.items.map((item) => item.type.trim()),
  ).slice(0, MAX_DEBUG_TYPES);
  const requiredTypeBreakdown = uniqueStrings(requiredTypes.map((value) => value.trim()))
    .map((value) => breakdownStructType(value));
  const typeComparisons = buildTypeComparisons({
    directOwnedObjects,
    kioskItems: kioskResult.items,
    requiredTypes,
  });
  const ownershipChecks = buildOwnershipChecks({
    directOwnedObjects,
    kioskItems: kioskResult.items,
    requiredTypes,
    requiredObjectIds,
    network,
    rpcEndpoint,
  });
  const zeroCountReason = determineZeroCountReason({
    requiredTypes,
    requiredObjectIds,
    directOwnedCount: directOwnedObjects.length,
    kioskCount: kioskResult.kioskIds.length,
    kioskItemCount: kioskResult.items.length,
    matchedDirectObjects,
    matchedKioskItems,
    typeComparisons,
  });

  const diagnostic: NftOwnershipDiagnostic = {
    connectedAddress: owner,
    network,
    rpcEndpoint,
    targetTypes: uniqueStrings(requiredTypes.map((value) => value.trim())),
    targetObjectIds: uniqueStrings(requiredObjectIds.map((value) => normalizeObjectId(value)).filter(Boolean)),
    directOwnedCount: directOwnedObjects.length,
    kioskCount: kioskResult.kioskIds.length,
    kioskItemCount: kioskResult.items.length,
    directOwnedPages: directOwnedResult.pageDiagnostics,
    kioskPages: kioskResult.pageDiagnostics,
    directOwnedTypes,
    kioskItemTypes,
    kioskItemsByKiosk: kioskResult.kioskItemsByKiosk,
    requiredTypeBreakdown,
    typeComparisons,
    matchedDirectObjects,
    matchedKioskItems,
    sampleObjectTypes: uniqueStrings([
      ...directOwnedTypes,
      ...kioskItemTypes,
    ]).slice(0, MAX_DEBUG_TYPES),
    ownershipChecks,
    zeroCountReason,
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
  rpcEndpoint = "",
  requiredObjectIds: string[] = [],
) {
  return checkOwnedNftsForClient(suiClient, owner, requiredTypes, network, rpcEndpoint, requiredObjectIds);
}

export {
  breakdownStructType,
  filterOwnedObjectsByType,
  matchesOwnedObjectType,
  normalizeStructType,
} from "./nftOwnershipShared";
