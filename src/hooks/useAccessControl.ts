import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { findRoleEntriesForAddress } from "../lib/accessRegistry";
import {
  ACCESS_CONTROL_ADMIN_CAP_TYPE,
  ACCESS_CONTROL_OWNER_CAP_TYPE,
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
  ACCESS_CONTROL_REVIEWER_CAP_TYPE,
} from "../lib/sui";
import { useAccessRegistry } from "./useAccessRegistry";

export type CapabilityProfile = {
  isConfigured: boolean;
  packageId: string;
  registryId: string;
  hasOwnerCap: boolean;
  hasAdminCap: boolean;
  hasReviewerCap: boolean;
  ownerCapIds: string[];
  adminCapIds: string[];
  reviewerCapIds: string[];
};

type OwnedObjectEntry = {
  data?: {
    objectId?: string;
    type?: string;
    content?: {
      dataType?: string;
      fields?: Record<string, unknown>;
    };
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
  options?: {
    showType?: boolean;
    showContent?: boolean;
  };
  limit?: number;
  filter?: {
    StructType: string;
  };
};

export type DebugOwnedObject = {
  objectId: string;
  type: string;
  registryId: string;
};

function normalizeObjectId(value?: string | null) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function normalizeType(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function extractRegistryId(entry: OwnedObjectEntry) {
  const fields = entry.data?.content?.fields;
  if (!fields) {
    return "";
  }

  const raw = fields.registry_id;
  if (typeof raw === "string") {
    return normalizeObjectId(raw);
  }

  if (!raw || typeof raw !== "object") {
    return "";
  }

  const objectLike = raw as { id?: string; bytes?: string };
  if (typeof objectLike.id === "string") {
    return normalizeObjectId(objectLike.id);
  }
  if (typeof objectLike.bytes === "string") {
    return normalizeObjectId(objectLike.bytes);
  }
  return "";
}

function extractCapIds(
  entries: OwnedObjectEntry[],
  expectedType: string,
  registryId: string,
) {
  const normalizedExpectedType = normalizeType(expectedType);
  return entries
    .filter((entry) => normalizeType(entry.data?.type) === normalizedExpectedType)
    .filter((entry) => {
      if (!registryId) {
        return true;
      }
      const entryRegistryId = extractRegistryId(entry);
      return !entryRegistryId || entryRegistryId === registryId;
    })
    .map((entry) => entry.data?.objectId ?? "")
    .filter(Boolean);
}

function inferOwnedCapRegistryId(entries: OwnedObjectEntry[], preferredRegistryId: string) {
  const registryIds = [
    ...new Set(entries.map((entry) => extractRegistryId(entry)).filter(Boolean)),
  ];
  if (preferredRegistryId && registryIds.includes(preferredRegistryId)) {
    return preferredRegistryId;
  }
  return registryIds[0] ?? "";
}

async function fetchOwnedObjectsByType(
  suiClient: ReturnType<typeof useSuiClient>,
  owner: string,
  structType: string,
) {
  const matches: OwnedObjectEntry[] = [];
  let cursor: string | null | undefined = null;
  let pageCount = 0;

  do {
    const page = (await suiClient.getOwnedObjects({
      owner,
      cursor: cursor ?? undefined,
      filter: {
        StructType: structType,
      },
      options: {
        showType: true,
        showContent: true,
      },
      limit: 50,
    } as OwnedObjectsRequest)) as OwnedObjectsResponse;

    matches.push(...(page.data ?? []));
    cursor = page.hasNextPage ? page.nextCursor : null;
    pageCount += 1;
  } while (cursor && pageCount < 20);

  return matches;
}

export function useAccessControl(address?: string | null) {
  const suiClient = useSuiClient();
  const { registry, isLoadingRegistry, error: registryError } = useAccessRegistry();
  const packageId = normalizeObjectId(ACCESS_CONTROL_PACKAGE_ID);
  const registryId = normalizeObjectId(ACCESS_CONTROL_REGISTRY_ID);
  const enabled = Boolean(address && packageId);
  const targetTypes = useMemo(
    () =>
      new Set(
        [
          ACCESS_CONTROL_OWNER_CAP_TYPE,
          ACCESS_CONTROL_ADMIN_CAP_TYPE,
          ACCESS_CONTROL_REVIEWER_CAP_TYPE,
        ]
          .map((value) => normalizeType(value))
          .filter(Boolean),
      ),
    [],
  );

  const ownedObjectsQuery = useQuery({
    queryKey: ["access-control-owned-objects", address ?? "", packageId, registryId],
    enabled,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const capTypes = [
        ACCESS_CONTROL_OWNER_CAP_TYPE,
        ACCESS_CONTROL_ADMIN_CAP_TYPE,
        ACCESS_CONTROL_REVIEWER_CAP_TYPE,
      ].filter(Boolean);
      const pages = await Promise.all(
        capTypes.map((capType) => fetchOwnedObjectsByType(suiClient, address ?? "", capType)),
      );

      return pages
        .flat()
        .filter((entry) => targetTypes.has(normalizeType(entry.data?.type)));
    },
  });

  const capabilityProfile = useMemo<CapabilityProfile>(() => {
    const ownedCapEntries = ownedObjectsQuery.data ?? [];
    const inferredRegistryId = inferOwnedCapRegistryId(ownedCapEntries, registryId);
    const effectiveRegistryId = inferredRegistryId || registryId;
    const canValidateAgainstRegistry =
      Boolean(registryId) &&
      effectiveRegistryId === registryId &&
      Boolean(registry.owner || registry.admins.length > 0 || registry.reviewers.length > 0);

    const ownedOwnerCapIds = extractCapIds(
      ownedCapEntries,
      ACCESS_CONTROL_OWNER_CAP_TYPE,
      effectiveRegistryId,
    );
    const ownedAdminCapIds = extractCapIds(
      ownedCapEntries,
      ACCESS_CONTROL_ADMIN_CAP_TYPE,
      effectiveRegistryId,
    );
    const ownedReviewerCapIds = extractCapIds(
      ownedCapEntries,
      ACCESS_CONTROL_REVIEWER_CAP_TYPE,
      effectiveRegistryId,
    );

    const ownerCapIds =
      canValidateAgainstRegistry && address
        ? ownedOwnerCapIds.filter(
            (capId) =>
              registry.owner?.capId === capId &&
              registry.owner?.address === normalizeObjectId(address),
          )
        : ownedOwnerCapIds;
    const adminCapIds =
      canValidateAgainstRegistry && address
        ? ownedAdminCapIds.filter((capId) =>
            findRoleEntriesForAddress(registry, "admin", address).some(
              (entry) => entry.capId === capId,
            ),
          )
        : ownedAdminCapIds;
    const reviewerCapIds =
      canValidateAgainstRegistry && address
        ? ownedReviewerCapIds.filter((capId) =>
            findRoleEntriesForAddress(registry, "reviewer", address).some(
              (entry) => entry.capId === capId,
            ),
          )
        : ownedReviewerCapIds;

    return {
      isConfigured: Boolean(packageId),
      packageId,
      registryId: effectiveRegistryId,
      hasOwnerCap: ownerCapIds.length > 0,
      hasAdminCap: adminCapIds.length > 0,
      hasReviewerCap: reviewerCapIds.length > 0,
      ownerCapIds,
      adminCapIds,
      reviewerCapIds,
    };
  }, [address, ownedObjectsQuery.data, packageId, registry, registryId]);

  const ownedObjects = useMemo<DebugOwnedObject[]>(() => {
    return (ownedObjectsQuery.data ?? []).map((entry) => ({
      objectId: entry.data?.objectId ?? "",
      type: entry.data?.type ?? "",
      registryId: extractRegistryId(entry),
    }));
  }, [ownedObjectsQuery.data]);

  return {
    ...ownedObjectsQuery,
    data: ownedObjectsQuery.data ?? [],
    error: ownedObjectsQuery.error ?? null,
    isError: ownedObjectsQuery.isError,
    isPending: ownedObjectsQuery.isPending,
    isLoadingAccess: (enabled && ownedObjectsQuery.isPending) || isLoadingRegistry,
    ownedObjects,
    capabilityProfile,
    registry,
    registryError: registryError ?? null,
  };
}
