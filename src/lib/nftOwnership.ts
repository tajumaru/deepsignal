import type { ClientWithCoreApi } from "@mysten/sui/client";
import { isSuiRateLimitError } from "./rpcErrors";
import { normalizeSuiAddress } from "./suiAddress";
import {
  breakdownStructType,
  matchesOwnedObjectType,
  normalizeStructType,
  type OwnedObjectEntry,
  type StructTypeBreakdown,
} from "./nftOwnershipShared";

type LegacyOwnedObjectsResponse = {
  data?: OwnedObjectEntry[];
  hasNextPage?: boolean;
  nextCursor?: string | null;
};

type LegacyOwnedObjectsRequest = {
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

type LegacyDynamicFieldsResponse = {
  data?: Array<{
    name?: {
      type?: string;
      value?: unknown;
    };
    objectType?: string;
    objectId?: string;
  }>;
  hasNextPage?: boolean;
  nextCursor?: string | null;
};

type LegacyObjectResponse = {
  data?: {
    objectId?: string;
    type?: string;
    owner?: unknown;
    content?: {
      fields?: Record<string, unknown>;
    } | null;
  } | null;
};

type CoreObject = {
  objectId: string;
  type?: string;
  owner?: unknown;
  json?: Record<string, unknown> | null;
};

type CoreDynamicFieldPage = {
  dynamicFields: Array<{
    name?: {
      type?: string;
      bcs?: Uint8Array;
    };
    valueType?: string;
    childId?: string;
  }>;
  hasNextPage: boolean;
  cursor: string | null;
};

export type OwnershipQueryClient = {
  core?: ClientWithCoreApi["core"] | {
    listOwnedObjects?: (request: {
      owner: string;
      cursor?: string | null;
      type?: string;
      include?: {
        json?: boolean;
      };
      limit?: number;
    }) => Promise<{
      objects: CoreObject[];
      hasNextPage: boolean;
      cursor: string | null;
    }>;
    getObject?: (request: {
      objectId: string;
      include?: {
        json?: boolean;
      };
    }) => Promise<{
      object: CoreObject;
    }>;
    listDynamicFields?: (request: {
      parentId: string;
      cursor?: string | null;
      limit?: number;
    }) => Promise<CoreDynamicFieldPage>;
  };
  getOwnedObjects?: (request: LegacyOwnedObjectsRequest) => Promise<unknown>;
  getObject?: (request: {
    id: string;
    options?: {
      showType?: boolean;
      showContent?: boolean;
      showOwner?: boolean;
    };
  }) => Promise<unknown>;
  getDynamicFields?: (request: {
    parentId: string;
    cursor?: string | null;
    limit?: number;
  }) => Promise<unknown>;
  $extend?: unknown;
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
  isListed: boolean;
  state: Array<"placed" | "locked" | "listed">;
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

export type ActualTypeBreakdownDiagnostic = {
  source: "direct" | "kiosk";
  actualType: string;
  normalizedActualType: string;
  breakdown: StructTypeBreakdown;
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

export type ObjectLookupDiagnostic = {
  objectId: string;
  type: string;
  normalizedType: string;
  found: boolean;
};

export type StructTypeExactMatchDiagnostic = {
  objectId: string;
  configuredStructType: string;
  actualType: string;
  exactMatch: boolean;
  normalizedMatch: boolean;
};

export type NftOwnershipDiagnostic = {
  connectedAddress: string;
  network: string;
  rpcEndpoint: string;
  ownedObjectsOwnerAddress: string;
  ownedObjectsFetchCount: number;
  ownedObjectsShowTypeRequested: boolean;
  ownedObjectsStructTypeFilterUsed: boolean;
  ownedObjectsFetchStrategy: "full-scan" | "struct-filter";
  targetTypes: string[];
  targetObjectIds: string[];
  expectedTypes: string[];
  expectedObjectIds: string[];
  requiredCount: number;
  matchedCount: number;
  matchedObjectIds: string[];
  matchedSources: Array<"direct" | "kiosk">;
  directOwnedCount: number;
  kioskCount: number;
  kioskItemCount: number;
  directOwnedPages: OwnedObjectsPageDiagnostic[];
  kioskPages: KioskPageDiagnostic[];
  directOwnedTypes: string[];
  kioskItemTypes: string[];
  kioskItemsByKiosk: KioskItemDiagnostic[];
  requiredTypeBreakdown: StructTypeBreakdown[];
  expectedTypeBreakdown: StructTypeBreakdown[];
  actualTypeBreakdown: ActualTypeBreakdownDiagnostic[];
  typeComparisons: TypeComparisonDiagnostic[];
  matchedDirectObjects: MatchedOwnedObject[];
  matchedKioskItems: MatchedKioskItem[];
  sampleObjectTypes: string[];
  directOwnedObjectIdsPreview: string[];
  directOwnedObjectTypesPreview: string[];
  ownershipChecks: OwnershipCheckDiagnostic[];
  debugObjectLookups: ObjectLookupDiagnostic[];
  configuredStructTypeExactMatches: StructTypeExactMatchDiagnostic[];
  zeroCountReason: string;
  rpcTransportUsed: string;
  kioskTransportUsed: string;
};

export type NftOwnershipCheckResult = {
  hasAccess: boolean;
  matchedBy: "owned-object" | "kiosk-item" | null;
  matchedObjectId?: string;
  matchedType?: string;
  checkedOwnedObjects: number;
  checkedKiosks: number;
  checkedKioskItems: number;
  errors: string[];
  hasRequiredNft: boolean;
  requiredCount: number;
  matchedCount: number;
  directOwnedCount: number;
  kioskCount: number;
  kioskItemCount: number;
  matchedDirectObjects: MatchedOwnedObject[];
  matchedKioskItems: MatchedKioskItem[];
  diagnostic: NftOwnershipDiagnostic;
};

export type NftGateResult = Pick<
  NftOwnershipCheckResult,
  | "hasAccess"
  | "matchedBy"
  | "matchedObjectId"
  | "matchedType"
  | "checkedOwnedObjects"
  | "checkedKiosks"
  | "checkedKioskItems"
  | "errors"
>;

export type NftGateCheckPhase = "owned-objects" | "kiosks";

type KioskQueryClient = {
  kiosk: {
    getOwnedKiosks: (input: {
      address: string;
      pagination?: {
        cursor?: string | null;
        limit?: number;
      };
    }) => Promise<{
      kioskIds: string[];
      kioskOwnerCaps?: Array<{
        objectId: string;
        kioskId: string;
        digest?: string;
        version?: string;
        isPersonal?: boolean;
      }>;
      nextCursor: string | null;
      hasNextPage: boolean;
    }>;
    getKiosk: (input: {
      id: string;
      options?: {
        withObjects?: boolean;
        withKioskFields?: boolean;
        withListingPrices?: boolean;
      };
    }) => Promise<{
      items?: Array<{
        objectId: string;
        kioskId: string;
        type: string;
        isLocked: boolean;
        listing?: {
          listingId?: string;
          price?: string;
          isExclusive?: boolean;
        };
        data?: {
          type?: string;
        };
      }>;
    }>;
  };
};

type OwnedKioskItem = MatchedKioskItem & {
  cursor: string | null;
  hasNextPage: boolean;
};

const PAGE_SIZE = 50;
const KIOSK_FETCH_BATCH_SIZE = 4;
const RPC_RETRY_ATTEMPTS = 4;
const RPC_RETRY_BASE_DELAY_MS = 250;
const MAX_DEBUG_TYPES = 50;
const MAX_DEBUG_COMPARISONS = 50;
const MAX_DEBUG_OBJECT_PREVIEW = 20;
const DEBUG_OBJECT_IDS = [
  "0x3dd324c329421180a51c1dab7ed2a4181012dab8c178e6cfab2b3debe608c481",
];

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
      await wait(RPC_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      console.warn(`[nft-ownership] rate limited during ${label}; retrying`, {
        attempt,
        maxAttempts: RPC_RETRY_ATTEMPTS,
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`RPC request failed during ${label}.`);
}

function normalizeObjectId(value: string | undefined | null) {
  return normalizeSuiAddress(value ?? "");
}

function normalizeOwnedEntryFromCore(object: CoreObject): OwnedObjectEntry {
  return {
    data: {
      objectId: object.objectId,
      type: object.type,
      owner: object.owner,
      content: object.json ? { fields: object.json } : null,
    },
  };
}

function normalizeLegacyObject(response: LegacyObjectResponse | null): LegacyObjectResponse | null {
  return response;
}

function normalizeCoreObject(response: { object: CoreObject } | null): LegacyObjectResponse | null {
  if (!response?.object) {
    return null;
  }
  return {
    data: {
      objectId: response.object.objectId,
      type: response.object.type,
      owner: response.object.owner,
      content: response.object.json ? { fields: response.object.json } : null,
    },
  };
}

function uniqueObjectEntries(entries: OwnedObjectEntry[]) {
  return entries.reduce<OwnedObjectEntry[]>((unique, entry) => {
    const objectId = normalizeObjectId(entry.data?.objectId);
    if (!objectId || unique.some((candidate) => normalizeObjectId(candidate.data?.objectId) === objectId)) {
      return unique;
    }
    unique.push({
      ...entry,
      data: {
        ...entry.data,
        objectId,
      },
    });
    return unique;
  }, []);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function getObjectOwnerId(owner: unknown) {
  if (!isRecord(owner)) {
    return "";
  }
  if (owner.$kind === "ObjectOwner" && typeof owner.ObjectOwner === "string") {
    return owner.ObjectOwner;
  }
  return typeof owner.ObjectOwner === "string" ? owner.ObjectOwner : "";
}

function getAddressOwnerId(owner: unknown) {
  if (!isRecord(owner)) {
    return "";
  }
  if (owner.$kind === "AddressOwner" && typeof owner.AddressOwner === "string") {
    return owner.AddressOwner;
  }
  return typeof owner.AddressOwner === "string" ? owner.AddressOwner : "";
}

function getFieldRecord(object: LegacyObjectResponse | null | undefined) {
  return object?.data?.content?.fields && isRecord(object.data.content.fields)
    ? object.data.content.fields
    : {};
}

function getNestedObjectId(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return "";
  }
  if (typeof value.id === "string") {
    return value.id;
  }
  if (isRecord(value.fields) && typeof value.fields.id === "string") {
    return value.fields.id;
  }
  if (isRecord(value.fields) && isRecord(value.fields.name)) {
    return getNestedObjectId(value.fields.name);
  }
  return "";
}

function getKioskItemState(item: { isLocked?: boolean; listing?: unknown }) {
  const state: Array<"placed" | "locked" | "listed"> = ["placed"];
  if (item.isLocked) {
    state.push("locked");
  }
  if (item.listing) {
    state.push("listed");
  }
  return state;
}

function getFieldNameType(name: unknown): string {
  if (!isRecord(name)) {
    return "";
  }
  if (typeof name.type === "string") {
    return name.type;
  }
  if (isRecord(name.fields) && isRecord(name.fields.name) && typeof name.fields.name.type === "string") {
    return name.fields.name.type;
  }
  return "";
}

function getKioskDynamicFieldItemId(fieldName: unknown) {
  if (!isRecord(fieldName)) {
    return "";
  }
  return getNestedObjectId(fieldName.value);
}

function getDynamicFieldKioskState(
  fields: NonNullable<LegacyDynamicFieldsResponse["data"]>,
  objectId: string,
) {
  const normalizedObjectId = normalizeObjectId(objectId);
  const state: Array<"placed" | "locked" | "listed"> = [];
  for (const field of fields) {
    const fieldItemId = normalizeObjectId(getKioskDynamicFieldItemId(field.name));
    if (fieldItemId !== normalizedObjectId) {
      continue;
    }
    const fieldNameType = field.name?.type ?? "";
    if (fieldNameType.includes("::kiosk::Item")) {
      state.push("placed");
    }
    if (fieldNameType.includes("::kiosk::Lock")) {
      state.push("locked");
    }
    if (fieldNameType.includes("::kiosk::Listing")) {
      state.push("listed");
    }
  }
  return uniqueStrings(state) as Array<"placed" | "locked" | "listed">;
}

function getRpcTransportUsed(client: OwnershipQueryClient) {
  if (client.core && typeof client.getOwnedObjects === "function" && typeof client.$extend === "function") {
    return "hybrid-core-plus-jsonrpc";
  }
  if (client.core) {
    return "core-api";
  }
  if (typeof client.getOwnedObjects === "function") {
    return "json-rpc";
  }
  return "unknown";
}

function getKioskTransportUsed(client: OwnershipQueryClient, usedKioskExtension: boolean, usedObjectIdFallback: boolean) {
  if (usedKioskExtension && usedObjectIdFallback) {
    return "json-rpc-kiosk-extension-plus-objectid-core";
  }
  if (usedKioskExtension) {
    return "json-rpc-kiosk-extension";
  }
  if (usedObjectIdFallback) {
    return "objectid-core-lookup";
  }
  return typeof client.$extend === "function" ? "json-rpc-kiosk-extension-available" : "unavailable";
}

async function fetchObjectForClient(client: OwnershipQueryClient, objectId: string) {
  if (typeof client.core?.getObject === "function") {
    return normalizeCoreObject(await retryRpcCall(
      () => client.core!.getObject!({ objectId, include: { json: true } }),
      `core.getObject(${objectId})`,
    ));
  }
  if (typeof client.getObject !== "function") {
    return null;
  }
  return normalizeLegacyObject((await retryRpcCall(
    () =>
      client.getObject!({
        id: objectId,
        options: {
          showType: true,
          showContent: true,
          showOwner: true,
        },
      }),
    `getObject(${objectId})`,
  )) as LegacyObjectResponse);
}

async function fetchDynamicFieldsForClient(client: OwnershipQueryClient, parentId: string) {
  const fields: NonNullable<LegacyDynamicFieldsResponse["data"]> = [];
  let cursor: string | null = null;

  do {
    if (typeof client.core?.listDynamicFields === "function") {
      const page = await retryRpcCall(
        () => client.core!.listDynamicFields!({ parentId, cursor, limit: PAGE_SIZE }),
        `core.listDynamicFields(${parentId})`,
      );
      fields.push(...page.dynamicFields.map((field) => ({
        name: {
          type: field.name?.type ?? "",
          value: field.childId ? { id: field.childId } : undefined,
        },
        objectType: field.valueType,
        objectId: field.childId,
      })));
      cursor = page.hasNextPage ? page.cursor : null;
      continue;
    }

    if (typeof client.getDynamicFields !== "function") {
      return fields;
    }

    const page = (await retryRpcCall(
      () => client.getDynamicFields!({ parentId, cursor, limit: PAGE_SIZE }),
      `getDynamicFields(${parentId})`,
    )) as LegacyDynamicFieldsResponse;
    fields.push(...(page.data ?? []));
    cursor = page.hasNextPage ? page.nextCursor ?? null : null;
  } while (cursor);

  return fields;
}

async function fetchOwnedObjectsPage(
  client: OwnershipQueryClient,
  owner: string,
  structType?: string,
  cursor?: string | null,
) {
  if (typeof client.core?.listOwnedObjects === "function") {
    const page = await retryRpcCall(
      () =>
        client.core!.listOwnedObjects!({
          owner,
          cursor,
          type: structType || undefined,
          include: { json: true },
          limit: PAGE_SIZE,
        }),
      structType ? `core.listOwnedObjects(${structType})` : "core.listOwnedObjects(all)",
    );
    return {
      data: page.objects.map((object) => normalizeOwnedEntryFromCore(object)),
      hasNextPage: page.hasNextPage,
      nextCursor: page.cursor,
    } satisfies LegacyOwnedObjectsResponse;
  }

  if (typeof client.getOwnedObjects !== "function") {
    throw new Error("Owned objects client does not support owned object queries.");
  }

  return (await retryRpcCall(
    () =>
      client.getOwnedObjects!({
        owner,
        cursor: cursor ?? undefined,
        filter: structType ? { StructType: structType } : undefined,
        options: {
          showType: true,
          showContent: true,
          showOwner: true,
        },
        limit: PAGE_SIZE,
      }),
    structType ? `getOwnedObjects(${structType})` : "getOwnedObjects(all)",
  )) as LegacyOwnedObjectsResponse;
}

export async function fetchAllOwnedSuiObjectsForClient(client: OwnershipQueryClient, owner: string) {
  const entries: OwnedObjectEntry[] = [];
  const pageDiagnostics: OwnedObjectsPageDiagnostic[] = [];
  let cursor: string | null = null;

  do {
    const page = await fetchOwnedObjectsPage(client, owner, undefined, cursor);
    entries.push(...(page.data ?? []));
    pageDiagnostics.push({
      cursor,
      hasNextPage: Boolean(page.hasNextPage),
      nextCursor: page.nextCursor ?? null,
      resultCount: page.data?.length ?? 0,
    });
    cursor = page.hasNextPage ? page.nextCursor ?? null : null;
  } while (cursor);

  return {
    entries: uniqueObjectEntries(entries),
    pageDiagnostics,
  };
}

export async function fetchOwnedSuiObjectsForClient(
  client: OwnershipQueryClient,
  owner: string,
  structTypes: string[] = [],
) {
  const normalizedStructTypes = uniqueStrings(structTypes.map((value) => value.trim()));
  if (normalizedStructTypes.length === 0) {
    const result = await fetchAllOwnedSuiObjectsForClient(client, owner);
    return result.entries;
  }

  const entries: OwnedObjectEntry[] = [];
  for (const structType of normalizedStructTypes) {
    let cursor: string | null = null;
    do {
      const page = await fetchOwnedObjectsPage(client, owner, structType, cursor);
      entries.push(...(page.data ?? []));
      cursor = page.hasNextPage ? page.nextCursor ?? null : null;
    } while (cursor);
  }

  return uniqueObjectEntries(entries);
}

async function resolveObjectIdOwnership(
  client: OwnershipQueryClient,
  ownerAddress: string,
  requiredObjectId: string,
  requiredTypes: string[],
) {
  const normalizedOwner = normalizeObjectId(ownerAddress);
  const normalizedObjectId = normalizeObjectId(requiredObjectId);
  const targetObject = await fetchObjectForClient(client, normalizedObjectId);
  const targetType = targetObject?.data?.type?.trim() ?? "";
  const typeMatches = requiredTypes.length === 0 || requiredTypes.some((requiredType) => matchesOwnedObjectType(targetType, requiredType));

  if (!targetObject?.data || !typeMatches) {
    return {
      directMatch: null as MatchedOwnedObject | null,
      kioskMatch: null as OwnedKioskItem | null,
      directSeenEntry: null as OwnedObjectEntry | null,
      kioskSeenItem: null as OwnedKioskItem | null,
    };
  }

  const addressOwnerId = normalizeObjectId(getAddressOwnerId(targetObject.data.owner));
  if (addressOwnerId === normalizedOwner) {
    const directSeenEntry: OwnedObjectEntry = {
      data: {
        objectId: normalizedObjectId,
        type: targetType,
        owner: targetObject.data.owner,
        content: targetObject.data.content ?? null,
      },
    };
    return {
      directMatch: {
        objectId: normalizedObjectId,
        type: targetType,
      },
      kioskMatch: null,
      directSeenEntry,
      kioskSeenItem: null,
    };
  }

  const dynamicFieldObjectId = getObjectOwnerId(targetObject.data.owner);
  if (!dynamicFieldObjectId) {
    return {
      directMatch: null,
      kioskMatch: null,
      directSeenEntry: null,
      kioskSeenItem: null,
    };
  }

  const dynamicFieldObject = await fetchObjectForClient(client, dynamicFieldObjectId);
  const dynamicFieldFields = getFieldRecord(dynamicFieldObject);
  const fieldNameType = getFieldNameType(dynamicFieldFields.name);
  const fieldValueId = normalizeObjectId(getNestedObjectId(dynamicFieldFields.value));
  const kioskId = getObjectOwnerId(dynamicFieldObject?.data?.owner);
  const isKioskItemField =
    (dynamicFieldObject?.data?.type ?? "").includes("::dynamic_field::Field") &&
    fieldNameType.includes("::kiosk::Item") &&
    fieldValueId === normalizedObjectId &&
    Boolean(kioskId);

  if (!isKioskItemField || !kioskId) {
    return {
      directMatch: null,
      kioskMatch: null,
      directSeenEntry: null,
      kioskSeenItem: null,
    };
  }

  const kioskObject = await fetchObjectForClient(client, kioskId);
  const kioskFields = getFieldRecord(kioskObject);
  const kioskOwner = typeof kioskFields.owner === "string" ? normalizeObjectId(kioskFields.owner) : "";
  if ((kioskObject?.data?.type ?? "") !== "0x2::kiosk::Kiosk" || kioskOwner !== normalizedOwner) {
    return {
      directMatch: null,
      kioskMatch: null,
      directSeenEntry: null,
      kioskSeenItem: null,
    };
  }

  const dynamicFields = await fetchDynamicFieldsForClient(client, kioskId);
  const kioskState = getDynamicFieldKioskState(dynamicFields, normalizedObjectId);
  const resolvedState = kioskState.length > 0 ? kioskState : (["placed"] as Array<"placed" | "locked" | "listed">);
  const kioskItem: OwnedKioskItem = {
    objectId: normalizedObjectId,
    kioskId,
    type: targetType,
    isLocked: resolvedState.includes("locked"),
    isListed: resolvedState.includes("listed"),
    state: resolvedState,
    cursor: null,
    hasNextPage: false,
  };

  return {
    directMatch: null,
    kioskMatch: kioskItem,
    directSeenEntry: null,
    kioskSeenItem: kioskItem,
  };
}

async function fetchOwnedKioskItemsForTypes(
  client: OwnershipQueryClient,
  ownerAddress: string,
  requiredTypes: string[],
  requiredObjectIds: string[],
  requiredCount: number,
) {
  if (typeof client.$extend !== "function") {
    return {
      kioskIds: [] as string[],
      items: [] as OwnedKioskItem[],
      pageDiagnostics: [] as KioskPageDiagnostic[],
      kioskItemsByKiosk: [] as KioskItemDiagnostic[],
      usedExtension: false,
    };
  }

  const { kiosk } = await import("@mysten/kiosk");
  const extend = client.$extend as (...extensions: unknown[]) => unknown;
  const kioskClient = extend(kiosk() as unknown) as unknown as KioskQueryClient;
  const kioskIds = new Set<string>();
  const pageDiagnostics: KioskPageDiagnostic[] = [];
  let cursor: string | null = null;

  do {
    const page = await retryRpcCall(
      () => kioskClient.kiosk.getOwnedKiosks({ address: ownerAddress, pagination: { cursor, limit: PAGE_SIZE } }),
      "getOwnedKiosks",
    );
    page.kioskIds.forEach((kioskId) => kioskIds.add(kioskId));
    pageDiagnostics.push({
      cursor,
      hasNextPage: page.hasNextPage,
      nextCursor: page.nextCursor ?? null,
      kioskCount: page.kioskIds.length,
    });
    cursor = page.hasNextPage ? page.nextCursor ?? null : null;
  } while (cursor);

  const kioskIdList = [...kioskIds];
  const matchedItems: OwnedKioskItem[] = [];
  const kioskItemsByKiosk: KioskItemDiagnostic[] = [];

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
                withKioskFields: true,
                withListingPrices: true,
              },
            }),
          `getKiosk(${kioskId})`,
        ).then((result) => ({ kioskId, result })),
      ),
    );

    for (const { kioskId, result } of batchResults) {
      const normalizedItems = (result.items ?? []).map<OwnedKioskItem>((item) => ({
        objectId: normalizeObjectId(item.objectId),
        kioskId,
        type: item.data?.type?.trim() || item.type?.trim() || "",
        isLocked: item.isLocked,
        isListed: Boolean(item.listing),
        state: getKioskItemState(item),
        cursor: null,
        hasNextPage: false,
      }));
      kioskItemsByKiosk.push({
        kioskId,
        itemCount: normalizedItems.length,
        itemTypes: uniqueStrings(normalizedItems.map((item) => item.type)).slice(0, MAX_DEBUG_TYPES),
      });
      matchedItems.push(
        ...normalizedItems.filter((item) =>
          requiredObjectIds.includes(normalizeObjectId(item.objectId)) ||
          requiredTypes.some((requiredType) => matchesOwnedObjectType(item.type, requiredType)),
        ),
      );
      if (uniqueOwnedKioskItems(matchedItems).length >= requiredCount) {
        return {
          kioskIds: kioskIdList,
          items: uniqueOwnedKioskItems(matchedItems),
          pageDiagnostics,
          kioskItemsByKiosk,
          usedExtension: true,
        };
      }
    }
  }

  return {
    kioskIds: kioskIdList,
    items: uniqueOwnedKioskItems(matchedItems),
    pageDiagnostics,
    kioskItemsByKiosk,
    usedExtension: true,
  };
}

function buildTypeComparisons(requiredTypes: string[], directEntries: OwnedObjectEntry[], kioskItems: OwnedKioskItem[]) {
  const requiredEntries = uniqueStrings(requiredTypes.map((value) => value.trim()))
    .map((requiredType) => ({
      requiredType,
      normalizedRequiredType: normalizeStructType(requiredType),
    }))
    .filter((entry) => entry.normalizedRequiredType);
  const comparisons: TypeComparisonDiagnostic[] = [];
  const seenKeys = new Set<string>();

  const pushActualType = (source: "direct" | "kiosk", actualType: string) => {
    const normalizedActualType = normalizeStructType(actualType);
    for (const requiredEntry of requiredEntries) {
      const key = `${source}::${normalizedActualType}::${requiredEntry.normalizedRequiredType}`;
      if (!normalizedActualType || seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      comparisons.push({
        source,
        actualType,
        normalizedActualType,
        requiredType: requiredEntry.requiredType,
        normalizedRequiredType: requiredEntry.normalizedRequiredType,
        matches: normalizedActualType === requiredEntry.normalizedRequiredType,
        actualBreakdown: breakdownStructType(actualType),
        requiredBreakdown: breakdownStructType(requiredEntry.requiredType),
      });
      if (comparisons.length >= MAX_DEBUG_COMPARISONS) {
        return;
      }
    }
  };

  uniqueStrings(directEntries.map((entry) => entry.data?.type?.trim() ?? "")).slice(0, MAX_DEBUG_TYPES)
    .forEach((actualType) => pushActualType("direct", actualType));
  uniqueStrings(kioskItems.map((entry) => entry.type.trim())).slice(0, MAX_DEBUG_TYPES)
    .forEach((actualType) => pushActualType("kiosk", actualType));

  return comparisons;
}

function buildActualTypeBreakdown(directEntries: OwnedObjectEntry[], kioskItems: OwnedKioskItem[]) {
  return [
    ...uniqueStrings(directEntries.map((entry) => entry.data?.type?.trim() ?? "")).slice(0, MAX_DEBUG_TYPES)
      .map((actualType) => ({
        source: "direct" as const,
        actualType,
        normalizedActualType: normalizeStructType(actualType),
        breakdown: breakdownStructType(actualType),
      })),
    ...uniqueStrings(kioskItems.map((entry) => entry.type.trim())).slice(0, MAX_DEBUG_TYPES)
      .map((actualType) => ({
        source: "kiosk" as const,
        actualType,
        normalizedActualType: normalizeStructType(actualType),
        breakdown: breakdownStructType(actualType),
      })),
  ];
}

function buildDebugObjectLookups(entries: OwnedObjectEntry[], objectIds: string[]) {
  const objectTypeById = new Map(
    entries.map((entry) => [
      normalizeObjectId(entry.data?.objectId),
      entry.data?.type?.trim() ?? "",
    ]),
  );

  return uniqueStrings(objectIds.map((value) => normalizeObjectId(value)).filter(Boolean)).map((objectId) => {
    const actualType = objectTypeById.get(objectId) ?? "";
    return {
      objectId,
      type: actualType,
      normalizedType: normalizeStructType(actualType),
      found: Boolean(actualType),
    } satisfies ObjectLookupDiagnostic;
  });
}

function buildConfiguredStructTypeExactMatches(
  configuredStructTypes: string[],
  lookups: ObjectLookupDiagnostic[],
) {
  const configuredStructType = configuredStructTypes[0]?.trim() ?? "";
  if (!configuredStructType) {
    return [] as StructTypeExactMatchDiagnostic[];
  }
  const normalizedConfiguredStructType = normalizeStructType(configuredStructType);
  return lookups.map((lookup) => ({
    objectId: lookup.objectId,
    configuredStructType,
    actualType: lookup.type,
    exactMatch: lookup.type === configuredStructType,
    normalizedMatch: Boolean(lookup.normalizedType) && lookup.normalizedType === normalizedConfiguredStructType,
  }));
}

function buildOwnershipChecks(args: {
  directEntries: OwnedObjectEntry[];
  kioskItems: OwnedKioskItem[];
  requiredTypes: string[];
  requiredObjectIds: string[];
  network: string;
  rpcEndpoint: string;
}) {
  const checks: OwnershipCheckDiagnostic[] = [];
  const expectedTypes = uniqueStrings(args.requiredTypes.map((value) => value.trim()));
  const expectedObjectIds = uniqueStrings(args.requiredObjectIds.map((value) => normalizeObjectId(value)).filter(Boolean));

  for (const entry of args.directEntries) {
    const objectId = normalizeObjectId(entry.data?.objectId);
    const returnedType = entry.data?.type?.trim() ?? "";
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

function determineZeroCountReason(args: {
  requiredTypes: string[];
  requiredObjectIds: string[];
  matchedCount: number;
  requiredCount: number;
  directOwnedCount: number;
  kioskCount: number;
  kioskItemCount: number;
}) {
  if (args.matchedCount >= args.requiredCount) {
    return "matched_required_count";
  }
  if (args.matchedCount > 0) {
    return "matched_below_required_count";
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
  if (args.directOwnedCount > 0 && args.kioskItemCount === 0 && args.kioskCount > 0) {
    return "direct_objects_detected_kiosk_items_missing_required_type";
  }
  if (args.directOwnedCount > 0) {
    return "direct_objects_detected_but_required_type_not_matched";
  }
  return "types_detected_but_no_normalized_type_match";
}

export async function checkOwnedNftsForClient(
  client: OwnershipQueryClient,
  owner: string,
  requiredTypes: string[],
  requiredCount: number,
  network: string,
  rpcEndpoint = "",
  requiredObjectIds: string[] = [],
  onPhaseChange?: (phase: NftGateCheckPhase) => void,
): Promise<NftOwnershipCheckResult> {
  const normalizedRequiredCount = Math.max(1, Math.floor(requiredCount || 1));
  const normalizedRequiredTypes = uniqueStrings(requiredTypes.map((value) => value.trim()).filter(Boolean));
  const normalizedRequiredObjectIds = uniqueStrings(requiredObjectIds.map((value) => normalizeObjectId(value)).filter(Boolean));

  onPhaseChange?.("owned-objects");

  const objectIdResults = await Promise.all(
    normalizedRequiredObjectIds.map((objectId) =>
      resolveObjectIdOwnership(client, owner, objectId, normalizedRequiredTypes),
    ),
  );

  const objectIdDirectEntries = objectIdResults
    .map((entry) => entry.directSeenEntry)
    .filter((entry): entry is OwnedObjectEntry => Boolean(entry));
  const objectIdKioskItems = objectIdResults
    .map((entry) => entry.kioskSeenItem)
    .filter((entry): entry is OwnedKioskItem => Boolean(entry));

  const allOwnedObjectsResult = await fetchAllOwnedSuiObjectsForClient(client, owner);
  const directEntriesFromTypes = allOwnedObjectsResult.entries;

  const directEntries = uniqueObjectEntries([
    ...objectIdDirectEntries,
    ...directEntriesFromTypes,
  ]);

  const matchedDirectObjects = uniqueObjectEntries(
    directEntries.filter((entry) => {
      const objectId = normalizeObjectId(entry.data?.objectId);
      return normalizedRequiredObjectIds.includes(objectId) ||
        normalizedRequiredTypes.some((requiredType) => matchesOwnedObjectType(entry.data?.type, requiredType));
    }),
  ).map((entry) => ({
    objectId: normalizeObjectId(entry.data?.objectId),
    type: entry.data?.type?.trim() ?? "",
  }));

  const directMatchCount = new Set(matchedDirectObjects.map((entry) => entry.objectId)).size;
  const needsKioskPhase =
    directMatchCount < normalizedRequiredCount &&
    (normalizedRequiredTypes.length > 0 || normalizedRequiredObjectIds.length > 0);

  onPhaseChange?.("kiosks");
  const kioskTypeResult = needsKioskPhase
      ? await fetchOwnedKioskItemsForTypes(
        client,
        owner,
        normalizedRequiredTypes,
        normalizedRequiredObjectIds,
        normalizedRequiredCount,
      )
    : {
        kioskIds: [] as string[],
        items: [] as OwnedKioskItem[],
        pageDiagnostics: [] as KioskPageDiagnostic[],
        kioskItemsByKiosk: [] as KioskItemDiagnostic[],
        usedExtension: false,
      };

  const matchedKioskItems = uniqueOwnedKioskItems([
    ...objectIdKioskItems,
    ...kioskTypeResult.items.filter((item) =>
      normalizedRequiredObjectIds.includes(normalizeObjectId(item.objectId)) ||
      normalizedRequiredTypes.some((requiredType) => matchesOwnedObjectType(item.type, requiredType)),
    ),
  ]).map((item) => ({
    objectId: item.objectId,
    kioskId: item.kioskId,
    type: item.type,
    isLocked: item.isLocked,
    isListed: item.isListed,
    state: item.state,
  }));

  const matchedObjectIds = uniqueStrings([
    ...matchedDirectObjects.map((entry) => entry.objectId),
    ...matchedKioskItems.map((entry) => entry.objectId),
  ]);
  const matchedCount = matchedObjectIds.length;
  const hasAccess = matchedCount >= normalizedRequiredCount;
  const matchedBy = matchedDirectObjects[0] ? "owned-object" : matchedKioskItems[0] ? "kiosk-item" : null;
  const matchedObjectId = matchedDirectObjects[0]?.objectId ?? matchedKioskItems[0]?.objectId;
  const matchedType = matchedDirectObjects[0]?.type ?? matchedKioskItems[0]?.type;

  const allKioskItemsForDiagnostics = uniqueOwnedKioskItems([
    ...objectIdKioskItems,
    ...kioskTypeResult.items,
  ]);
  const directOwnedTypes = uniqueStrings(directEntries.map((entry) => entry.data?.type?.trim() ?? "")).slice(0, MAX_DEBUG_TYPES);
  const kioskItemTypes = uniqueStrings(allKioskItemsForDiagnostics.map((entry) => entry.type.trim())).slice(0, MAX_DEBUG_TYPES);
  const debugObjectLookups = buildDebugObjectLookups(directEntries, [
    ...normalizedRequiredObjectIds,
    ...DEBUG_OBJECT_IDS,
  ]);
  const configuredStructTypeExactMatches = buildConfiguredStructTypeExactMatches(
    normalizedRequiredTypes,
    debugObjectLookups,
  );
  const typeComparisons = buildTypeComparisons(normalizedRequiredTypes, directEntries, allKioskItemsForDiagnostics);
  const actualTypeBreakdown = buildActualTypeBreakdown(directEntries, allKioskItemsForDiagnostics);
  const ownershipChecks = buildOwnershipChecks({
    directEntries,
    kioskItems: allKioskItemsForDiagnostics,
    requiredTypes: normalizedRequiredTypes,
    requiredObjectIds: normalizedRequiredObjectIds,
    network,
    rpcEndpoint,
  });
  const zeroCountReason = determineZeroCountReason({
    requiredTypes: normalizedRequiredTypes,
    requiredObjectIds: normalizedRequiredObjectIds,
    matchedCount,
    requiredCount: normalizedRequiredCount,
    directOwnedCount: directEntries.length,
    kioskCount: kioskTypeResult.kioskIds.length,
    kioskItemCount: allKioskItemsForDiagnostics.length,
  });

  const diagnostic: NftOwnershipDiagnostic = {
    connectedAddress: owner,
    network,
    rpcEndpoint,
    ownedObjectsOwnerAddress: owner,
    ownedObjectsFetchCount: directEntries.length,
    ownedObjectsShowTypeRequested: true,
    ownedObjectsStructTypeFilterUsed: false,
    ownedObjectsFetchStrategy: "full-scan",
    targetTypes: normalizedRequiredTypes,
    targetObjectIds: normalizedRequiredObjectIds,
    expectedTypes: normalizedRequiredTypes,
    expectedObjectIds: normalizedRequiredObjectIds,
    requiredCount: normalizedRequiredCount,
    matchedCount,
    matchedObjectIds,
    matchedSources: uniqueStrings([
      ...(matchedDirectObjects.length > 0 ? ["direct"] : []),
      ...(matchedKioskItems.length > 0 ? ["kiosk"] : []),
    ]) as Array<"direct" | "kiosk">,
    directOwnedCount: directEntries.length,
    kioskCount: kioskTypeResult.kioskIds.length,
    kioskItemCount: allKioskItemsForDiagnostics.length,
    directOwnedPages: allOwnedObjectsResult.pageDiagnostics,
    kioskPages: kioskTypeResult.pageDiagnostics,
    directOwnedTypes,
    kioskItemTypes,
    kioskItemsByKiosk: kioskTypeResult.kioskItemsByKiosk,
    requiredTypeBreakdown: normalizedRequiredTypes.map((value) => breakdownStructType(value)),
    expectedTypeBreakdown: normalizedRequiredTypes.map((value) => breakdownStructType(value)),
    actualTypeBreakdown,
    typeComparisons,
    matchedDirectObjects,
    matchedKioskItems,
    sampleObjectTypes: uniqueStrings([...directOwnedTypes, ...kioskItemTypes]).slice(0, MAX_DEBUG_TYPES),
    directOwnedObjectIdsPreview: directEntries
      .map((entry) => normalizeObjectId(entry.data?.objectId))
      .filter(Boolean)
      .slice(0, MAX_DEBUG_OBJECT_PREVIEW),
    directOwnedObjectTypesPreview: directEntries
      .map((entry) => entry.data?.type?.trim() ?? "")
      .filter(Boolean)
      .slice(0, MAX_DEBUG_OBJECT_PREVIEW),
    ownershipChecks,
    debugObjectLookups,
    configuredStructTypeExactMatches,
    zeroCountReason,
    rpcTransportUsed: getRpcTransportUsed(client),
    kioskTransportUsed: getKioskTransportUsed(
      client,
      kioskTypeResult.usedExtension,
      objectIdKioskItems.length > 0,
    ),
  };

  return {
    hasAccess,
    matchedBy,
    matchedObjectId,
    matchedType,
    checkedOwnedObjects: directEntries.length,
    checkedKiosks: kioskTypeResult.kioskIds.length,
    checkedKioskItems: allKioskItemsForDiagnostics.length,
    errors: [],
    hasRequiredNft: hasAccess,
    requiredCount: normalizedRequiredCount,
    matchedCount,
    directOwnedCount: directEntries.length,
    kioskCount: kioskTypeResult.kioskIds.length,
    kioskItemCount: allKioskItemsForDiagnostics.length,
    matchedDirectObjects,
    matchedKioskItems,
    diagnostic,
  };
}

export async function hasRequiredNft(
  client: OwnershipQueryClient,
  owner: string,
  requiredTypes: string[],
  requiredCount: number,
  network: string,
  rpcEndpoint = "",
  requiredObjectIds: string[] = [],
) {
  return checkOwnedNftsForClient(
    client,
    owner,
    requiredTypes,
    requiredCount,
    network,
    rpcEndpoint,
    requiredObjectIds,
  );
}

export {
  breakdownStructType,
  filterOwnedObjectsByType,
  matchesOwnedObjectType,
  normalizeSuiType,
  normalizeStructType,
} from "./nftOwnershipShared";
