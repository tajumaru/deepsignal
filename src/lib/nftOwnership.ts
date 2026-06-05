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

export type StructTypeBreakdown = {
  rawType: string;
  normalizedType: string;
  packageId: string;
  module: string;
  struct: string;
  generics: string[];
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

export type NftOwnershipDiagnostic = {
  connectedAddress: string;
  network: string;
  rpcEndpoint: string;
  targetTypes: string[];
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

export function normalizeStructType(value?: string | null) {
  return normalizeSuiTypeName(value);
}

function splitGenericArguments(value: string) {
  const generics: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "<") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ">") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        generics.push(trimmed);
      }
      current = "";
      continue;
    }
    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    generics.push(trimmed);
  }

  return generics;
}

export function breakdownStructType(value?: string | null): StructTypeBreakdown {
  const rawType = value?.trim() ?? "";
  const normalizedType = normalizeStructType(rawType);
  if (!normalizedType) {
    return {
      rawType,
      normalizedType,
      packageId: "",
      module: "",
      struct: "",
      generics: [],
    };
  }

  const [packageId = "", module = "", structAndGenerics = ""] = normalizedType.split("::");
  const genericStartIndex = structAndGenerics.indexOf("<");
  const hasGenerics = genericStartIndex >= 0 && structAndGenerics.endsWith(">");
  const struct = hasGenerics ? structAndGenerics.slice(0, genericStartIndex) : structAndGenerics;
  const genericContent = hasGenerics
    ? structAndGenerics.slice(genericStartIndex + 1, -1)
    : "";

  return {
    rawType,
    normalizedType,
    packageId,
    module,
    struct,
    generics: genericContent ? splitGenericArguments(genericContent) : [],
  };
}

export function matchesOwnedObjectType(actualType: string | undefined, requiredType: string) {
  const normalizedActualType = normalizeStructType(actualType);
  const normalizedRequiredType = normalizeStructType(requiredType);
  if (!normalizedActualType || !normalizedRequiredType) {
    return false;
  }
  return normalizedActualType === normalizedRequiredType;
}

export function filterOwnedObjectsByType(entries: OwnedObjectEntry[], requiredTypes: string[]) {
  const normalizedRequiredTypes = new Set(requiredTypes.map((value) => normalizeStructType(value)).filter(Boolean));
  if (normalizedRequiredTypes.size === 0) {
    return entries;
  }
  return entries.filter((entry) => normalizedRequiredTypes.has(normalizeStructType(entry.data?.type)));
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
    items,
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

function determineZeroCountReason(args: {
  requiredTypes: string[];
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
  if (args.requiredTypes.length === 0) {
    return "required_type_missing";
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
): Promise<NftOwnershipCheckResult> {
  const [directOwnedResult, kioskResult] = await Promise.all([
    fetchAllOwnedSuiObjectsForClient(suiClient, owner),
    fetchOwnedKioskItemsForClient(suiClient, owner),
  ]);
  const directOwnedObjects = directOwnedResult.entries;
  const matchedDirectObjects = filterOwnedObjectsByType(directOwnedObjects, requiredTypes)
    .map((entry) => ({
      objectId: entry.data?.objectId?.trim() ?? "",
      type: entry.data?.type?.trim() ?? "",
    }))
    .filter((entry) => entry.objectId && entry.type);
  const matchedKioskItems = kioskResult.items.filter((item) =>
    requiredTypes.some((requiredType) => matchesOwnedObjectType(item.type, requiredType)),
  );
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
  const zeroCountReason = determineZeroCountReason({
    requiredTypes,
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
) {
  return checkOwnedNftsForClient(suiClient, owner, requiredTypes, network, rpcEndpoint);
}
