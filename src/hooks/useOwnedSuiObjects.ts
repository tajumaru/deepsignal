import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { endPerf, markPerfMilestone, startPerf } from "../lib/perf";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { isSuiRateLimitError } from "../lib/sui";
import type { OwnedObjectEntry } from "../lib/nftOwnershipShared";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";
import { useReadOnlyCoreSuiClient } from "./useReadOnlyCoreSuiClient";

const OWNED_OBJECTS_CACHE_PREFIX = "deepsignal.ownedObjects";
let nftOwnershipModulePromise: Promise<typeof import("../lib/nftOwnership")> | null = null;

async function getNftOwnershipModule() {
  nftOwnershipModulePromise ??= import("../lib/nftOwnership");
  return nftOwnershipModulePromise;
}

export function useOwnedSuiObjects(
  address?: string | null,
  options: { enabled?: boolean; structTypes?: string[] } = {},
) {
  const suiClient = useReadOnlyCoreSuiClient();
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
      const spanName = `sui-rpc:owned-objects:${address ?? "unknown"}`;
      startPerf(spanName, `${structTypes.length || 0} struct filters`);
      markPerfMilestone("sui-rpc:owned-objects:start", address ? "wallet-connected" : "wallet-missing");
      logRouteLifecycle("sui-rpc:owned-objects-start", {
        address: address ? "present" : "absent",
        structTypeCount: structTypes.length,
        rpcMode: rpc.mode,
        rpcUrl: rpc.currentRpcUrl,
      });
      try {
        const { fetchOwnedSuiObjectsForClient } = await getNftOwnershipModule();
        const result = await fetchOwnedSuiObjectsForClient(suiClient, address ?? "", structTypes);
        setIsRateLimitedFallback(false);
        endPerf(spanName, "ok", `${result.length} objects`);
        markPerfMilestone("sui-rpc:owned-objects:end", `${result.length} objects`);
        logRouteLifecycle("sui-rpc:owned-objects-end", {
          objectCount: result.length,
          rpcMode: rpc.mode,
        });
        return result;
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
          setIsRateLimitedFallback(true);
          endPerf(spanName, "ok", "rate-limited-fallback");
          markPerfMilestone("sui-rpc:owned-objects:end", "rate-limited-fallback");
          logRouteLifecycle("sui-rpc:owned-objects-rate-limited", {
            fallbackCount: lastSuccessfulData.length,
            rpcMode: rpc.mode,
          });
          return lastSuccessfulData;
        }
        endPerf(spanName, "failed", error instanceof Error ? error.message : String(error));
        logRouteLifecycle("sui-rpc:owned-objects-failed", {
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          rpcMode: rpc.mode,
        });
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
export { matchesOwnedObjectType, normalizeSuiTypeName } from "../lib/nftOwnershipShared";

export async function fetchOwnedSuiObjectsForClient(
  ...args: Parameters<typeof import("../lib/nftOwnership").fetchOwnedSuiObjectsForClient>
) {
  const module = await getNftOwnershipModule();
  return module.fetchOwnedSuiObjectsForClient(...args);
}
