import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRpcInfrastructure } from "../../../rpcInfrastructure";
import {
  getCurrentFormNftNetwork,
  isNftGatedForm,
  normalizeFormNftGate,
  resolveFormAccessMode,
} from "../../../lib/formAccess";
import type { FormSchema, FormNftGate } from "../../../types";

const ROUTE_LEVEL_SUCCESS_CACHE_MS = 30_000;
const ROUTE_LEVEL_FAILURE_COOLDOWN_MS = 15_000;

type PublicNftOwnershipCacheEntry = {
  checkedAt: number;
  error?: string;
  inFlight?: Promise<number>;
  ownedCount: number;
};

const publicNftOwnershipCache = new Map<string, PublicNftOwnershipCacheEntry>();

type OwnedObjectsRpcRequest = {
  owner: string;
  filter?: unknown;
  options?: unknown;
  cursor?: string | null;
  limit?: number | null;
};

type PublicNftGateDebugInfo = {
  connectedAddress?: string;
  requiredType?: string;
  fetchedObjectCount: number;
  matchedObjectId?: string;
  matchedType?: string;
  firstObjectTypes: string[];
  lastError?: string;
};

export interface PublicNftAccessCheckResult {
  checkedAt: string;
  passed: boolean;
  reason?: "not_required" | "wallet_missing" | "network_mismatch" | "ownership_missing" | "rpc_failed";
  walletAddress?: string;
  structType?: string;
  requiredCount?: number;
  ownedCount: number;
  network?: FormNftGate["network"];
  gateViewing?: boolean;
  gateSubmission?: boolean;
  debug?: PublicNftGateDebugInfo;
}

function buildAccessCheckResult(
  nftGate: FormNftGate | undefined,
  walletAddress: string | undefined,
  ownedCount: number,
  passed: boolean,
  reason?: PublicNftAccessCheckResult["reason"],
  debug?: PublicNftGateDebugInfo,
): PublicNftAccessCheckResult {
  return {
    checkedAt: new Date().toISOString(),
    passed,
    reason,
    walletAddress,
    structType: nftGate?.structType,
    requiredCount: nftGate?.requiredCount,
    ownedCount,
    network: nftGate?.network,
    gateViewing: nftGate?.gateViewing,
    gateSubmission: nftGate?.gateSubmission,
    debug,
  };
}

function buildOwnershipCacheKey(rpcUrl: string, walletAddress: string, structType: string) {
  return `${rpcUrl}::${walletAddress}::${structType}`;
}

function clearOwnershipCacheForAddress(rpcUrl: string, walletAddress?: string) {
  if (!walletAddress) {
    return;
  }
  const prefix = `${rpcUrl}::${walletAddress}::`;
  for (const key of publicNftOwnershipCache.keys()) {
    if (key.startsWith(prefix)) {
      publicNftOwnershipCache.delete(key);
    }
  }
}

export function buildOwnedObjectsRpcParams(request: OwnedObjectsRpcRequest) {
  const query =
    request.filter || request.options
      ? {
          ...(request.filter ? { filter: request.filter } : {}),
          ...(request.options ? { options: request.options } : {}),
        }
      : null;
  return [
    request.owner,
    query,
    request.cursor ?? null,
    request.limit ?? null,
  ];
}

export function usePublicNftGate(form: FormSchema | null, walletAddress?: string) {
  const rpc = useRpcInfrastructure();
  const accessMode = form ? resolveFormAccessMode(form) : "public";
  const nftGate = useMemo(
    () => normalizeFormNftGate(form?.nftGate, accessMode) ?? undefined,
    [accessMode, form?.nftGate],
  );
  const nftRequired = Boolean(form && isNftGatedForm(form) && nftGate);
  const networkMatches = !nftGate || nftGate.network === getCurrentFormNftNetwork();
  const [ownedCount, setOwnedCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [gateError, setGateError] = useState("");
  const [debugInfo, setDebugInfo] = useState<PublicNftGateDebugInfo>({
    fetchedObjectCount: 0,
    firstObjectTypes: [],
  });
  const [lastResolvedCheckKey, setLastResolvedCheckKey] = useState<string | null>(null);
  const previousWalletAddressRef = useRef<string | undefined>(undefined);
  const activeCheckKey = nftRequired && walletAddress && nftGate?.structType
    ? buildOwnershipCacheKey(rpc.currentRpcUrl, walletAddress, nftGate.structType)
    : null;

  const logDebugInfo = useCallback((nextDebugInfo: PublicNftGateDebugInfo) => {
    console.info("[nft-gate]", {
      connectedAddress: nextDebugInfo.connectedAddress,
      requiredType: nextDebugInfo.requiredType,
      fetchedObjectCount: nextDebugInfo.fetchedObjectCount,
      matchedObjectId: nextDebugInfo.matchedObjectId,
      matchedType: nextDebugInfo.matchedType,
      first10ObjectTypes: nextDebugInfo.firstObjectTypes.slice(0, 10),
      lastError: nextDebugInfo.lastError,
    });
  }, []);

  const checkOwnership = useCallback(async (options: { forceFresh?: boolean } = {}) => {
    if (!nftRequired || !walletAddress || !nftGate?.structType || !networkMatches) {
      setOwnedCount(0);
      setGateError("");
      setIsChecking(false);
      setLastResolvedCheckKey(null);
      setDebugInfo({
        connectedAddress: walletAddress,
        requiredType: nftGate?.structType,
        fetchedObjectCount: 0,
        firstObjectTypes: [],
      });
      return 0;
    }
    const cacheKey = buildOwnershipCacheKey(rpc.currentRpcUrl, walletAddress, nftGate.structType);
    const forceFresh = options.forceFresh === true;
    const now = Date.now();
    const cached = publicNftOwnershipCache.get(cacheKey);

    if (!forceFresh) {
      if (cached?.inFlight) {
        setIsChecking(true);
        return cached.inFlight;
      }
      if (cached && !cached.error && now - cached.checkedAt < ROUTE_LEVEL_SUCCESS_CACHE_MS) {
        setOwnedCount(cached.ownedCount);
        setGateError("");
        setIsChecking(false);
        return cached.ownedCount;
      }
      if (cached && cached.error && now - cached.checkedAt < ROUTE_LEVEL_FAILURE_COOLDOWN_MS) {
        setOwnedCount(cached.ownedCount);
        setGateError(cached.error);
        setIsChecking(false);
        return cached.ownedCount;
      }
    }

    setIsChecking(true);
    const requestPromise = (async () => {
      // Reuse the same owned-object fetch path as useOwnedSuiObjects while keeping
      // Mysten wallet/query code out of the public route's initial bundle.
      const { fetchOwnedSuiObjectsForClient, matchesOwnedObjectType } = await import("../../../hooks/useOwnedSuiObjects");
      const client = {
        async getOwnedObjects(request: unknown) {
          const ownedObjectsRequest = request as {
            owner: string;
            filter?: unknown;
            options?: unknown;
            cursor?: string | null;
            limit?: number | null;
          };
          const response = await fetch(rpc.currentRpcUrl, {
            method: "POST",
            // Keep this as a simple CORS request. Some public Sui fullnodes reject
            // browser preflight for application/json even though the RPC itself is reachable.
            headers: {
              "Content-Type": "text/plain;charset=UTF-8",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "public-nft-gate",
              method: "suix_getOwnedObjects",
              params: buildOwnedObjectsRpcParams(ownedObjectsRequest),
            }),
          });
          if (!response.ok) {
            throw new Error(`Sui RPC request failed with status ${response.status}.`);
          }
          const payload = await response.json();
          if (payload?.error) {
            throw new Error(payload.error.message || "Sui RPC request failed.");
          }
          return payload?.result;
        },
      };
      const ownedObjects = await fetchOwnedSuiObjectsForClient(client, walletAddress);
      const matchedEntry = ownedObjects.find((entry) => matchesOwnedObjectType(entry.data?.type, nftGate.structType));
      const matchedObjects = matchedEntry ? ownedObjects.filter((entry) => matchesOwnedObjectType(entry.data?.type, nftGate.structType)) : [];
      const firstObjectTypes = ownedObjects
        .map((entry) => entry.data?.type?.trim())
        .filter((value): value is string => Boolean(value))
        .slice(0, 10);
      const nextDebugInfo: PublicNftGateDebugInfo = {
        connectedAddress: walletAddress,
        requiredType: nftGate.structType,
        fetchedObjectCount: ownedObjects.length,
        matchedObjectId: matchedEntry?.data?.objectId,
        matchedType: matchedEntry?.data?.type,
        firstObjectTypes,
      };
      setDebugInfo(nextDebugInfo);
      logDebugInfo(nextDebugInfo);
      return matchedObjects.length;
    })();

    publicNftOwnershipCache.set(cacheKey, {
      checkedAt: now,
      error: cached?.error,
      inFlight: requestPromise,
      ownedCount: cached?.ownedCount ?? 0,
    });

    try {
      const nextOwnedCount = await requestPromise;
      publicNftOwnershipCache.set(cacheKey, {
        checkedAt: Date.now(),
        ownedCount: nextOwnedCount,
      });
      setOwnedCount(nextOwnedCount);
      setGateError("");
      setLastResolvedCheckKey(cacheKey);
      return nextOwnedCount;
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "NFT ownership could not be verified.";
      const nextDebugInfo: PublicNftGateDebugInfo = {
        connectedAddress: walletAddress,
        requiredType: nftGate.structType,
        fetchedObjectCount: 0,
        firstObjectTypes: [],
        lastError: nextError,
      };
      publicNftOwnershipCache.set(cacheKey, {
        checkedAt: Date.now(),
        error: nextError,
        ownedCount: 0,
      });
      setGateError(nextError);
      setOwnedCount(0);
      setDebugInfo(nextDebugInfo);
      setLastResolvedCheckKey(cacheKey);
      logDebugInfo(nextDebugInfo);
      throw error;
    } finally {
      setIsChecking(false);
    }
  }, [logDebugInfo, networkMatches, nftGate?.structType, nftRequired, rpc.currentRpcUrl, walletAddress]);

  useEffect(() => {
    if (!nftRequired || !walletAddress || !nftGate?.structType || !networkMatches) {
      setOwnedCount(0);
      setGateError("");
      setIsChecking(false);
      setLastResolvedCheckKey(null);
      return;
    }
  }, [networkMatches, nftGate?.structType, nftRequired, walletAddress]);

  useEffect(() => {
    clearOwnershipCacheForAddress(rpc.currentRpcUrl, previousWalletAddressRef.current);
    clearOwnershipCacheForAddress(rpc.currentRpcUrl, walletAddress);
    previousWalletAddressRef.current = walletAddress;
    setLastResolvedCheckKey(null);
    setDebugInfo({
      connectedAddress: walletAddress,
      requiredType: nftGate?.structType,
      fetchedObjectCount: 0,
      firstObjectTypes: [],
    });
  }, [rpc.currentRpcUrl, walletAddress, nftGate?.structType]);

  useEffect(() => {
    if (!nftRequired || !walletAddress || !nftGate?.structType || !networkMatches) {
      return;
    }
    void checkOwnership().catch(() => undefined);
  }, [checkOwnership, networkMatches, nftGate?.structType, nftRequired, walletAddress]);

  const meetsRequirement = Boolean(
    nftGate &&
      walletAddress &&
      networkMatches &&
      ownedCount >= Math.max(1, nftGate.requiredCount || 1),
  );
  const canViewForm = !nftRequired || meetsRequirement;
  const viewGateActive = Boolean(nftRequired && nftGate?.gateViewing !== false);
  const submitGateActive = Boolean(nftRequired && nftGate?.gateSubmission !== false);

  const recheckAccess = useCallback(async (): Promise<PublicNftAccessCheckResult> => {
    if (!nftRequired) {
      return buildAccessCheckResult(nftGate, walletAddress, 0, true, "not_required", debugInfo);
    }
    if (!walletAddress) {
      return buildAccessCheckResult(nftGate, walletAddress, 0, false, "wallet_missing", debugInfo);
    }
    if (!networkMatches) {
      return buildAccessCheckResult(nftGate, walletAddress, ownedCount, false, "network_mismatch", debugInfo);
    }
    try {
      const nextOwnedCount = await checkOwnership({ forceFresh: true });
      const passed = nextOwnedCount >= Math.max(1, nftGate?.requiredCount || 1);
      return buildAccessCheckResult(
        nftGate,
        walletAddress,
        nextOwnedCount,
        passed,
        passed ? undefined : "ownership_missing",
        debugInfo,
      );
    } catch {
      return buildAccessCheckResult(nftGate, walletAddress, ownedCount, false, "rpc_failed", debugInfo);
    }
  }, [checkOwnership, debugInfo, networkMatches, nftGate, nftRequired, ownedCount, walletAddress]);

  return {
    accessMode,
    nftGate,
    nftRequired,
    viewGateActive,
    submitGateActive,
    isChecking,
    ownedCount,
    meetsRequirement,
    canViewForm,
    hasResolvedOwnership: activeCheckKey !== null && lastResolvedCheckKey === activeCheckKey,
    debugInfo,
    gateError: !networkMatches ? "This NFT-gated signal is configured for a different Sui network." : gateError,
    recheckAccess,
  };
}
