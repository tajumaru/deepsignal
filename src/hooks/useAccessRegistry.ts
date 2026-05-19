import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { parseRegistrySnapshot } from "../lib/accessRegistry";
import {
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
  isSuiRateLimitError,
} from "../lib/sui";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";

type RegistryObjectResponse = {
  data?: {
    content?: {
      dataType?: string;
      fields?: Record<string, unknown>;
    } | null;
  } | null;
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

export function useAccessRegistry() {
  const suiClient = useSuiClient();
  const rpc = useRpcInfrastructure();
  const packageId = normalizeObjectId(ACCESS_CONTROL_PACKAGE_ID);
  const registryId = normalizeObjectId(ACCESS_CONTROL_REGISTRY_ID);
  const enabled = Boolean(packageId && registryId && !rpc.isRateLimitedCooldownActive);

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
    queryFn: async () => {
      try {
        const response = (await suiClient.getObject({
          id: registryId,
          options: {
            showContent: true,
          },
        })) as RegistryObjectResponse;

        return response.data?.content?.fields ?? null;
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
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
