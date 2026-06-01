import { useSuiClient } from "@mysten/dapp-kit";
import { SuinsClient } from "@mysten/suins";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";
import { isSuiRateLimitError } from "../lib/sui";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";

export interface SuiIdentityProfile {
  suinsName: string | null;
  avatarUrl: string | null;
}

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

function normalizeAvatarUrl(url?: string | null) {
  const value = url?.trim();
  if (!value) {
    return null;
  }

  const ipfsPrefix = "ipfs://";
  const candidate = value.startsWith(ipfsPrefix)
    ? `https://ipfs.io/ipfs/${value.slice(ipfsPrefix.length).replace(/^ipfs\//, "")}`
    : value;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function useSuiIdentity(address?: string | null, options: { enabled?: boolean } = {}) {
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
    queryKey: ["suins-identity-profile", normalizedAddress, rpc.mode, rpc.currentRpcUrl],
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
        const suinsName = normalizeSuiName(response.data.name);
        if (!suinsName) {
          return { suinsName: null, avatarUrl: null } satisfies SuiIdentityProfile;
        }

        try {
          const suinsClient = new SuinsClient({
            client: suiClient,
            network: rpc.network,
          });
          const record = await suinsClient.getNameRecord(suinsName);
          const avatarUrl = normalizeAvatarUrl(record?.avatar ?? record?.data?.image_url);
          return { suinsName, avatarUrl } satisfies SuiIdentityProfile;
        } catch (error) {
          if (isSuiRateLimitError(error)) {
            handleRateLimitedRpcFallback(rpc, error);
          } else {
            console.warn("SuiNS avatar lookup failed; falling back to name or short address.", error);
          }
          return { suinsName, avatarUrl: null } satisfies SuiIdentityProfile;
        }
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
          return { suinsName: null, avatarUrl: null } satisfies SuiIdentityProfile;
        }
        console.warn("SuiNS reverse lookup failed; falling back to short address.", error);
        return { suinsName: null, avatarUrl: null } satisfies SuiIdentityProfile;
      }
    },
  });
}

export function useSuiName(address?: string | null, options: { enabled?: boolean } = {}) {
  const identity = useSuiIdentity(address, options);
  return {
    ...identity,
    data: identity.data?.suinsName ?? null,
  };
}
