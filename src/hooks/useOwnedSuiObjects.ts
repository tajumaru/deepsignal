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
  options?: {
    showType?: boolean;
    showContent?: boolean;
  };
  limit?: number;
};

async function fetchOwnedObjects(
  suiClient: ReturnType<typeof useSuiClient>,
  owner: string,
) {
  const matches: OwnedObjectEntry[] = [];
  let cursor: string | null | undefined = null;
  let pageCount = 0;

  do {
    const page = (await suiClient.getOwnedObjects({
      owner,
      cursor: cursor ?? undefined,
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

export function useOwnedSuiObjects(address?: string | null, options: { enabled?: boolean } = {}) {
  const suiClient = useSuiClient();
  const rpc = useRpcInfrastructure();
  const queryEnabled = options.enabled ?? true;
  const enabled = Boolean(queryEnabled && address);
  const [lastSuccessfulData, setLastSuccessfulData] = useState<OwnedObjectEntry[]>([]);

  const query = useQuery({
    queryKey: ["sui-owned-objects", address ?? "", rpc.mode, rpc.currentRpcUrl],
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
        return await fetchOwnedObjects(suiClient, address ?? "");
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
          return lastSuccessfulData;
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (query.data && query.data.length > 0) {
      setLastSuccessfulData(query.data);
      return;
    }
    if (!address) {
      setLastSuccessfulData([]);
    }
  }, [address, query.data]);

  return query;
}

export type { OwnedObjectEntry };
