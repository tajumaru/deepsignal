import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { parseRegistrySnapshot } from "../lib/accessRegistry";
import {
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
  isSuiRateLimitError,
} from "../lib/sui";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";
import { useReadOnlyCoreSuiClient } from "./useReadOnlyCoreSuiClient";

function extractRegistryFields(value: unknown) {
  const object =
    value && typeof value === "object" && "object" in (value as Record<string, unknown>)
      ? ((value as { object?: unknown }).object as Record<string, unknown> | null | undefined)
      : null;
  const json =
    object && typeof object.json === "object" && object.json && !Array.isArray(object.json)
      ? (object.json as Record<string, unknown>)
      : null;
  return json;
}

const ACCESS_REGISTRY_CACHE_PREFIX = "deepsignal.accessRegistry";

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

export function useAccessRegistry(options: { enabled?: boolean } = {}) {
  const suiClient = useReadOnlyCoreSuiClient();
  const rpc = useRpcInfrastructure();
  const packageId = normalizeObjectId(ACCESS_CONTROL_PACKAGE_ID);
  const registryId = normalizeObjectId(ACCESS_CONTROL_REGISTRY_ID);
  const cacheKey = `${ACCESS_REGISTRY_CACHE_PREFIX}:${packageId}:${registryId}:${rpc.network}`;
  const queryEnabled = options.enabled ?? true;
  const enabled = Boolean(queryEnabled && packageId && registryId);

  const registryQuery = useQuery({
    queryKey: [
      "access-control-registry",
      packageId,
      registryId,
      rpc.mode,
      rpc.currentRpcUrl,
    ],
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    initialData: () => {
      if (typeof window === "undefined" || !packageId || !registryId) {
        return undefined;
      }
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
      } catch {
        return undefined;
      }
    },
    queryFn: async () => {
      try {
        const response = await suiClient.core.getObject({
          objectId: registryId,
          include: {
            json: true,
          },
        });

        const fields = extractRegistryFields(response);
        if (fields && typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(cacheKey, JSON.stringify(fields));
          } catch {
            // Best effort cache only.
          }
        }
        return fields;
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
          if (typeof window !== "undefined") {
            try {
              const raw = window.sessionStorage.getItem(cacheKey);
              return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
            } catch {
              return null;
            }
          }
          return null;
        }
        throw error;
      }
    },
  });

  const registry = useMemo(
    () => parseRegistrySnapshot(registryQuery.data ?? undefined),
    [registryQuery.data],
  );

  return {
    ...registryQuery,
    registry,
    isConfigured: enabled,
    isLoadingRegistry: enabled && registryQuery.isPending,
  };
}
