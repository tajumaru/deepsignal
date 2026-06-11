import { useMemo } from "react";
import { findRoleEntriesForAddress } from "../lib/accessRegistry";
import {
  ACCESS_CONTROL_ADMIN_CAP_TYPE,
  ACCESS_CONTROL_OWNER_CAP_TYPE,
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
} from "../lib/sui";
import { useAccessRegistry } from "./useAccessRegistry";
import { useOwnedSuiObjects } from "./useOwnedSuiObjects";

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

export type AccessControlMode = "wallet_unavailable" | "wallet_connected";

type OwnedObjectEntry = {
  data?: {
    objectId?: string;
    type?: string;
    content?: {
      dataType?: string;
      fields?: Record<string, unknown>;
    } | null;
  } | null;
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

export function useAccessControl(address?: string | null, options: { enabled?: boolean } = {}) {
  const queryEnabled = options.enabled ?? true;
  const { registry, isLoadingRegistry, error: registryError } = useAccessRegistry({
    enabled: Boolean(queryEnabled && address),
  });
  const packageId = normalizeObjectId(ACCESS_CONTROL_PACKAGE_ID);
  const registryId = normalizeObjectId(ACCESS_CONTROL_REGISTRY_ID);
  const enabled = Boolean(queryEnabled && address && packageId);
  const walletUnavailable = !enabled;
  const targetTypes = useMemo(
    () =>
      new Set(
        [
          ACCESS_CONTROL_OWNER_CAP_TYPE,
          ACCESS_CONTROL_ADMIN_CAP_TYPE,
        ]
          .map((value) => normalizeType(value))
          .filter(Boolean),
    ),
    [],
  );
  const ownedObjectsQuery = useOwnedSuiObjects(address, {
    enabled,
    structTypes: [
      ACCESS_CONTROL_OWNER_CAP_TYPE,
      ACCESS_CONTROL_ADMIN_CAP_TYPE,
    ],
  });
  const ownedCapabilityEntries = useMemo(
    () => (ownedObjectsQuery.data ?? []).filter((entry) => targetTypes.has(normalizeType(entry.data?.type))),
    [ownedObjectsQuery.data, targetTypes],
  );
  const accessVerificationBlocked =
    enabled &&
    ownedCapabilityEntries.length === 0 &&
    ownedObjectsQuery.isRateLimitedFallback === true;

  const capabilityProfile = useMemo<CapabilityProfile>(() => {
    const inferredRegistryId = inferOwnedCapRegistryId(ownedCapabilityEntries, registryId);
    const effectiveRegistryId = inferredRegistryId || registryId;
    const canValidateAgainstRegistry =
      Boolean(registryId) &&
      effectiveRegistryId === registryId &&
      Boolean(registry.owner || registry.admins.length > 0);

    const ownedOwnerCapIds = extractCapIds(
      ownedCapabilityEntries,
      ACCESS_CONTROL_OWNER_CAP_TYPE,
      effectiveRegistryId,
    );
    const ownedAdminCapIds = extractCapIds(
      ownedCapabilityEntries,
      ACCESS_CONTROL_ADMIN_CAP_TYPE,
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
    return {
      isConfigured: Boolean(packageId),
      packageId,
      registryId: effectiveRegistryId,
      hasOwnerCap: ownerCapIds.length > 0,
      hasAdminCap: adminCapIds.length > 0,
      hasReviewerCap: false,
      ownerCapIds,
      adminCapIds,
      reviewerCapIds: [],
    };
  }, [address, ownedCapabilityEntries, packageId, registry, registryId]);

  const ownedObjects = useMemo<DebugOwnedObject[]>(() => {
    return ownedCapabilityEntries.map((entry) => ({
      objectId: entry.data?.objectId ?? "",
      type: entry.data?.type ?? "",
      registryId: extractRegistryId(entry),
    }));
  }, [ownedCapabilityEntries]);

  return {
    ...ownedObjectsQuery,
    data: ownedCapabilityEntries,
    error: ownedObjectsQuery.error ?? null,
    isError: ownedObjectsQuery.isError,
    isPending: ownedObjectsQuery.isPending,
    isLoadingAccess: walletUnavailable ? false : (enabled && ownedObjectsQuery.isPending) || isLoadingRegistry,
    accessVerificationBlocked,
    ownedObjects,
    capabilityProfile,
    mode: walletUnavailable ? ("wallet_unavailable" as const) : ("wallet_connected" as const),
    canWrite: capabilityProfile.hasOwnerCap || capabilityProfile.hasAdminCap,
    canAdmin: capabilityProfile.hasOwnerCap || capabilityProfile.hasAdminCap,
    address: address ?? null,
    walletContextAvailable: enabled,
    registry,
    registryError: registryError ?? null,
  };
}
