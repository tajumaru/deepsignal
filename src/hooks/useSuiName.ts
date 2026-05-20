import { useSuiClient } from "@mysten/dapp-kit";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";
import { isSuiRateLimitError } from "../lib/sui";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";

function normalizeAddress(address?: string | null) {
  return address?.trim().toLowerCase() ?? "";
}

function normalizeSuiName(name?: string | null) {
  const value = name?.trim();
  if (!value) {
    return null;
  }
  return value.endsWith(".sui") ? value : `${value}.sui`;
}

export function useSuiName(address?: string | null, options: { enabled?: boolean } = {}) {
  const suiClient = useSuiClient();
  const rpc = useRpcInfrastructure();
  const normalizedAddress = normalizeAddress(address);
  const queryEnabled = options.enabled ?? true;
  const enabled = Boolean(
    queryEnabled &&
      normalizedAddress &&
      isValidSuiAddress(normalizedAddress) &&
      !rpc.isRateLimitedCooldownActive,
  );

  return useQuery({
    queryKey: ["suins-reverse-lookup", normalizedAddress, rpc.mode, rpc.currentRpcUrl],
    enabled,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        const response = await suiClient.core.defaultNameServiceName({
          address: normalizedAddress,
        });
        return normalizeSuiName(response.data.name);
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
          return null;
        }
        console.warn("SuiNS reverse lookup failed; falling back to short address.", error);
        return null;
      }
    },
  });
}
