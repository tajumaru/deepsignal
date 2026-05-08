import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { parseRegistrySnapshot } from "../lib/accessRegistry";
import { ACCESS_CONTROL_PACKAGE_ID, ACCESS_CONTROL_REGISTRY_ID } from "../lib/sui";

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
  const packageId = normalizeObjectId(ACCESS_CONTROL_PACKAGE_ID);
  const registryId = normalizeObjectId(ACCESS_CONTROL_REGISTRY_ID);
  const enabled = Boolean(packageId && registryId);

  const registryQuery = useQuery({
    queryKey: ["access-control-registry", packageId, registryId],
    enabled,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = (await suiClient.getObject({
        id: registryId,
        options: {
          showContent: true,
        },
      })) as RegistryObjectResponse;

      return response.data?.content?.fields ?? null;
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

