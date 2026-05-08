import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useMemo } from "react";
import {
  ACCESS_CONTROL_ADMIN_CAP_TYPE,
  ACCESS_CONTROL_OWNER_CAP_TYPE,
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
  ACCESS_CONTROL_REVIEWER_CAP_TYPE,
} from "../lib/sui";

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
  return entries
    .filter((entry) => entry.data?.type === expectedType)
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

export function useAccessControl(address?: string | null) {
  const packageId = ACCESS_CONTROL_PACKAGE_ID;
  const registryId = normalizeObjectId(ACCESS_CONTROL_REGISTRY_ID);
  const enabled = Boolean(address && packageId);

  const ownedObjectsQuery = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: address ?? "",
      filter: { Package: packageId },
      options: {
        showType: true,
        showContent: true,
      },
      limit: 100,
    },
    {
      enabled,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  );

  const capabilityProfile = useMemo<CapabilityProfile>(() => {
    const entries = ((ownedObjectsQuery.data as OwnedObjectsResponse | undefined)?.data ??
      []) as OwnedObjectEntry[];

    const ownerCapIds = extractCapIds(
      entries,
      ACCESS_CONTROL_OWNER_CAP_TYPE,
      registryId,
    );
    const adminCapIds = extractCapIds(
      entries,
      ACCESS_CONTROL_ADMIN_CAP_TYPE,
      registryId,
    );
    const reviewerCapIds = extractCapIds(
      entries,
      ACCESS_CONTROL_REVIEWER_CAP_TYPE,
      registryId,
    );

    return {
      isConfigured: Boolean(packageId),
      packageId,
      registryId,
      hasOwnerCap: ownerCapIds.length > 0,
      hasAdminCap: adminCapIds.length > 0,
      hasReviewerCap: reviewerCapIds.length > 0,
      ownerCapIds,
      adminCapIds,
      reviewerCapIds,
    };
  }, [ownedObjectsQuery.data, packageId, registryId]);

  return {
    ...ownedObjectsQuery,
    capabilityProfile,
  };
}
