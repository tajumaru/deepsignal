import { useSuiClient } from "@mysten/dapp-kit";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";

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

export function useSuiName(address?: string | null) {
  const suiClient = useSuiClient();
  const normalizedAddress = normalizeAddress(address);
  const enabled = Boolean(normalizedAddress && isValidSuiAddress(normalizedAddress));

  return useQuery({
    queryKey: ["suins-reverse-lookup", normalizedAddress],
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
        console.warn("SuiNS reverse lookup failed; falling back to short address.", error);
        return null;
      }
    },
  });
}
