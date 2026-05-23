import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { isSuiRateLimitError } from "../lib/sui";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";

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

type OwnedObjectsResponse = {
  data?: OwnedObjectEntry[];
  hasNextPage?: boolean;
  nextCursor?: string | null;
};

type OwnedObjectsRequest = {
  owner: string;
  cursor?: string;
  filter?: {
    StructType: string;
  };
  options?: {
    showType?: boolean;
    showContent?: boolean;
  };
  limit?: number;
};

const OWNED_OBJECTS_CACHE_PREFIX = "deepsignal.ownedObjects";

async function fetchOwnedObjects(
  suiClient: ReturnType<typeof useSuiClient>,
  owner: string,
  structTypes: string[] = [],
) {
  const normalizedStructTypes = [...new Set(structTypes.map((value) => value.trim()).filter(Boolean))];
  const matches: OwnedObjectEntry[] = [];
  const queryStructTypes = normalizedStructTypes.length > 0 ? normalizedStructTypes : [""];

  for (const structType of queryStructTypes) {
    let cursor: string | null | undefined = null;

    do {
      const request: OwnedObjectsRequest = {
        owner,
        cursor: cursor ?? undefined,
        options: {
          showType: true,
          showContent: true,
        },
        limit: 50,
      };
      if (structType) {
        request.filter = { StructType: structType };
      }
      const page = (await suiClient.getOwnedObjects(request)) as OwnedObjectsResponse;

      matches.push(...(page.data ?? []));
      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);
  }

  return matches.reduce<OwnedObjectEntry[]>((unique, entry) => {
    const objectId = entry.data?.objectId?.trim();
    if (!objectId || unique.some((candidate) => candidate.data?.objectId?.trim() === objectId)) {
      return unique;
    }
    unique.push(entry);
    return unique;
  }, []);
}

export function useOwnedSuiObjects(
  address?: string | null,
  options: { enabled?: boolean; structTypes?: string[] } = {},
) {
  const suiClient = useSuiClient();
  const rpc = useRpcInfrastructure();
  const queryEnabled = options.enabled ?? true;
  const structTypes = options.structTypes ?? [];
  const enabled = Boolean(queryEnabled && address);
  const cacheKey = `${OWNED_OBJECTS_CACHE_PREFIX}:${address ?? ""}:${structTypes.join(",")}:${rpc.network}`;
  const [lastSuccessfulData, setLastSuccessfulData] = useState<OwnedObjectEntry[]>(() => {
    if (typeof window === "undefined" || !address) {
      return [];
    }
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as OwnedObjectEntry[]) : [];
    } catch {
      return [];
    }
  });
  const [isRateLimitedFallback, setIsRateLimitedFallback] = useState(false);

  const query = useQuery({
    queryKey: ["sui-owned-objects", address ?? "", structTypes.join(","), rpc.mode, rpc.currentRpcUrl],
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      try {
        const result = await fetchOwnedObjects(suiClient, address ?? "", structTypes);
        setIsRateLimitedFallback(false);
        return result;
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
          setIsRateLimitedFallback(true);
          return lastSuccessfulData;
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (query.data && query.data.length > 0) {
      setLastSuccessfulData(query.data);
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(query.data));
        } catch {
          // Best effort cache only.
        }
      }
      return;
    }
    if (!address) {
      setLastSuccessfulData([]);
      setIsRateLimitedFallback(false);
    }
  }, [address, cacheKey, query.data]);

  return {
    ...query,
    isRateLimitedFallback,
  };
}

export type { OwnedObjectEntry };
