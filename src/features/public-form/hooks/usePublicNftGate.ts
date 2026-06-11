import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  getCurrentFormNftNetwork,
  isNftGatedForm,
  normalizeFormNftGate,
  resolveFormAccessMode,
} from "../../../lib/formAccess";
import { getPreferredBrowserRpcUrl, getPreferredGrpcUrl } from "../../../lib/sui";
import { useRpcInfrastructure } from "../../../rpcInfrastructure";
import type { FormSchema, FormNftGate } from "../../../types";
import type { NftGateCheckPhase, NftOwnershipCheckResult, NftOwnershipDiagnostic } from "../../../lib/nftOwnership";

const ROUTE_LEVEL_SUCCESS_CACHE_MS = 30_000;
let publicNftOwnershipLoaderPromise: Promise<{
  checkOwnedNftsForClient: typeof import("../../../lib/nftOwnership").checkOwnedNftsForClient;
  createBrowserSafeSuiTransport: typeof import("../../../lib/suiRpcTransport").createBrowserSafeSuiTransport;
  SuiGrpcClient: typeof import("@mysten/sui/grpc").SuiGrpcClient;
  SuiJsonRpcClient: typeof import("@mysten/sui/jsonRpc").SuiJsonRpcClient;
}> | null = null;

type PublicNftOwnershipCacheEntry = {
  checkedAt: number;
  inFlight?: Promise<NftOwnershipCheckResult>;
  result?: NftOwnershipCheckResult;
};

const publicNftOwnershipCache = new Map<string, PublicNftOwnershipCacheEntry>();

export function clearPublicNftOwnershipCacheForTests() {
  if (import.meta.env.MODE !== "test") {
    return;
  }
  publicNftOwnershipCache.clear();
}

type PublicNftGateDebugInfo = NftOwnershipDiagnostic & {
  lastError?: string;
  checkedAt?: string;
  fetchErrors?: string[];
};

export interface PublicNftAccessCheckResult {
  checkedAt: string;
  status: "not_required" | "wallet_missing" | "checking" | "network_mismatch" | "rpc_error" | "no_match" | "passed";
  passed: boolean;
  reason?: "not_required" | "wallet_missing" | "network_mismatch" | "ownership_missing" | "rpc_error";
  walletAddress?: string;
  structType?: string;
  objectId?: string;
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
  status: PublicNftAccessCheckResult["status"],
  reason?: PublicNftAccessCheckResult["reason"],
  debug?: PublicNftGateDebugInfo,
): PublicNftAccessCheckResult {
  return {
    checkedAt: new Date().toISOString(),
    status,
    passed,
    reason,
    walletAddress,
    structType: nftGate?.structType,
    objectId: nftGate?.objectId,
    requiredCount: nftGate?.requiredCount,
    ownedCount,
    network: nftGate?.network,
    gateViewing: nftGate?.gateViewing,
    gateSubmission: nftGate?.gateSubmission,
    debug,
  };
}

function buildOwnershipCacheKey(
  network: FormNftGate["network"] | undefined,
  walletAddress: string,
  selector: string,
  requiredCount: number,
) {
  return `${network ?? "sui-mainnet"}::${walletAddress}::${selector}::${requiredCount}`;
}

function clearOwnershipCacheForAddress(network: FormNftGate["network"] | undefined, walletAddress?: string) {
  if (!walletAddress) {
    return;
  }
  const prefix = `${network ?? "sui-mainnet"}::${walletAddress}::`;
  for (const key of publicNftOwnershipCache.keys()) {
    if (key.startsWith(prefix)) {
      publicNftOwnershipCache.delete(key);
    }
  }
}

function createBaseDebugInfo(
  walletAddress: string | undefined,
  nftGate: FormNftGate | undefined,
  rpcEndpoint: string,
  zeroCountReason: string,
): PublicNftGateDebugInfo {
  return {
    checkedAt: new Date().toISOString(),
    connectedAddress: walletAddress ?? "",
    network: nftGate?.network ?? getCurrentFormNftNetwork(),
    rpcEndpoint,
    ownedObjectsOwnerAddress: walletAddress ?? "",
    ownedObjectsFetchCount: 0,
    ownedObjectsShowTypeRequested: true,
    ownedObjectsStructTypeFilterUsed: false,
    ownedObjectsFetchStrategy: "full-scan",
    targetTypes: nftGate?.structType ? [nftGate.structType] : [],
    targetObjectIds: nftGate?.objectId ? [nftGate.objectId] : [],
    expectedTypes: nftGate?.structType ? [nftGate.structType] : [],
    expectedObjectIds: nftGate?.objectId ? [nftGate.objectId] : [],
    requiredCount: Math.max(1, nftGate?.requiredCount || 1),
    matchedCount: 0,
    matchedObjectIds: [],
    matchedSources: [],
    directOwnedCount: 0,
    kioskCount: 0,
    kioskItemCount: 0,
    directOwnedPages: [],
    kioskPages: [],
    directOwnedTypes: [],
    kioskItemTypes: [],
    kioskItemsByKiosk: [],
    requiredTypeBreakdown: [],
    expectedTypeBreakdown: [],
    actualTypeBreakdown: [],
    typeComparisons: [],
    matchedDirectObjects: [],
    matchedKioskItems: [],
    sampleObjectTypes: [],
    directOwnedObjectIdsPreview: [],
    directOwnedObjectTypesPreview: [],
    ownershipChecks: [],
    debugObjectLookups: [],
    configuredStructTypeExactMatches: [],
    fetchErrors: [],
    zeroCountReason,
    rpcTransportUsed: "unknown",
    kioskTransportUsed: "unknown",
  };
}

function createErrorDebugInfo(
  walletAddress: string | undefined,
  nftGate: FormNftGate | undefined,
  rpcEndpoint: string,
  error: string,
  diagnostic?: Partial<NftOwnershipDiagnostic>,
): PublicNftGateDebugInfo {
  return {
    ...createBaseDebugInfo(walletAddress, nftGate, rpcEndpoint, "rpc_error_before_ownership_match"),
    ...(diagnostic ?? {}),
    checkedAt: new Date().toISOString(),
    fetchErrors: [error],
    lastError: error,
  };
}

function setBaseDebugInfoIfChanged(
  setter: Dispatch<SetStateAction<PublicNftGateDebugInfo>>,
  walletAddress: string | undefined,
  nftGate: FormNftGate | undefined,
  rpcEndpoint: string,
  zeroCountReason: string,
) {
  setter((current) => {
    const connectedAddress = walletAddress ?? "";
    if (
      current.connectedAddress === connectedAddress &&
      current.zeroCountReason === zeroCountReason &&
      current.rpcEndpoint === rpcEndpoint
    ) {
      return current;
    }
    return createBaseDebugInfo(walletAddress, nftGate, rpcEndpoint, zeroCountReason);
  });
}

async function loadPublicNftOwnershipModules() {
  if (!publicNftOwnershipLoaderPromise) {
    publicNftOwnershipLoaderPromise = Promise.all([
      import("../../../lib/nftOwnership"),
      import("../../../lib/suiRpcTransport"),
      import("@mysten/sui/grpc"),
      import("@mysten/sui/jsonRpc"),
    ]).then(([nftOwnership, suiRpcTransport, suiGrpc, suiJsonRpc]) => ({
      checkOwnedNftsForClient: nftOwnership.checkOwnedNftsForClient,
      createBrowserSafeSuiTransport: suiRpcTransport.createBrowserSafeSuiTransport,
      SuiGrpcClient: suiGrpc.SuiGrpcClient,
      SuiJsonRpcClient: suiJsonRpc.SuiJsonRpcClient,
    }));
  }

  return publicNftOwnershipLoaderPromise;
}

export function usePublicNftGate(form: FormSchema | null, walletAddress?: string) {
  const rpc = useRpcInfrastructure();
  const nftRpcUrl = useMemo(() => getPreferredBrowserRpcUrl(rpc.currentRpcUrl), [rpc.currentRpcUrl]);
  const accessMode = form ? resolveFormAccessMode(form) : "public";
  const nftGate = useMemo(
    () => normalizeFormNftGate(form?.nftGate, accessMode) ?? undefined,
    [accessMode, form?.nftGate],
  );
  const nftRequired = Boolean(form && isNftGatedForm(form) && nftGate);
  const requiredCount = Math.max(1, nftGate?.requiredCount || 1);
  const networkMatches = !nftGate || nftGate.network === getCurrentFormNftNetwork();
  const gateSelector = nftGate?.structType?.trim() || nftGate?.objectId?.trim() || "";
  const [ownedCount, setOwnedCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [checkingPhase, setCheckingPhase] = useState<NftGateCheckPhase | null>(null);
  const [gateError, setGateError] = useState("");
  const [debugInfo, setDebugInfo] = useState<PublicNftGateDebugInfo>(() =>
    createBaseDebugInfo(walletAddress, nftGate, nftRpcUrl, "not_checked_yet"),
  );
  const [lastResolvedCheckKey, setLastResolvedCheckKey] = useState<string | null>(null);
  const previousWalletAddressRef = useRef<string | undefined>(undefined);
  const previousCacheKeyRef = useRef<string | null>(null);
  const activeCheckKey = nftRequired && walletAddress && gateSelector
    ? buildOwnershipCacheKey(nftGate?.network, walletAddress, gateSelector, requiredCount)
    : null;

  const logDebugInfo = useCallback((nextDebugInfo: PublicNftGateDebugInfo) => {
    console.info("[nft-gate]", nextDebugInfo);
    console.info("[nft-gate:type-compare]", {
      requiredStructType: nftGate?.structType ?? "",
      requiredObjectId: nftGate?.objectId ?? "",
      requiredCount: nextDebugInfo.requiredCount,
      matchedCount: nextDebugInfo.matchedCount,
      matchedObjectIds: nextDebugInfo.matchedObjectIds,
      matchedSources: nextDebugInfo.matchedSources,
      sampleObjectTypes: nextDebugInfo.sampleObjectTypes,
      matchedDirectObjects: nextDebugInfo.matchedDirectObjects,
      matchedKioskItems: nextDebugInfo.matchedKioskItems,
      ownershipChecks: nextDebugInfo.ownershipChecks,
    });
  }, [nftGate?.objectId, nftGate?.structType]);

  const checkOwnership = useCallback(async (options: { forceFresh?: boolean } = {}) => {
    const resolvedNftGate = nftGate;
    if (!nftRequired || !walletAddress || !gateSelector || !networkMatches || !resolvedNftGate) {
      setOwnedCount(0);
      setGateError("");
      setIsChecking(false);
      setCheckingPhase(null);
      setLastResolvedCheckKey(null);
      setBaseDebugInfoIfChanged(setDebugInfo, walletAddress, nftGate, nftRpcUrl, "wallet_or_gate_not_ready");
      return null;
    }

    const cacheKey = buildOwnershipCacheKey(resolvedNftGate.network, walletAddress, gateSelector, requiredCount);
    const forceFresh = options.forceFresh === true;
    const now = Date.now();
    const cached = publicNftOwnershipCache.get(cacheKey);

    if (!forceFresh) {
      if (cached?.inFlight) {
        setIsChecking(true);
        return cached.inFlight;
      }
      if (cached?.result && now - cached.checkedAt < ROUTE_LEVEL_SUCCESS_CACHE_MS && cached.result.hasRequiredNft) {
        setOwnedCount(cached.result.matchedCount);
        setGateError("");
        setIsChecking(false);
        setCheckingPhase(null);
        setDebugInfo({
          ...cached.result.diagnostic,
          checkedAt: new Date(cached.checkedAt).toISOString(),
          fetchErrors: [...cached.result.errors],
        });
        return cached.result;
      }
    }

    setIsChecking(true);
    setCheckingPhase("owned-objects");
    const requestPromise = (async () => {
      const { checkOwnedNftsForClient, createBrowserSafeSuiTransport, SuiGrpcClient, SuiJsonRpcClient } =
        await loadPublicNftOwnershipModules();
      const jsonRpcClient = new SuiJsonRpcClient({
        network: rpc.network,
        transport: createBrowserSafeSuiTransport(nftRpcUrl),
      });
      const grpcUrl = getPreferredGrpcUrl(nftRpcUrl);
      const suiClient = grpcUrl
        ? {
            core: new SuiGrpcClient({
              network: rpc.network,
              baseUrl: grpcUrl,
            }).core,
            $extend: jsonRpcClient.$extend.bind(jsonRpcClient),
          }
        : jsonRpcClient;
      const requiredObjectIds = resolvedNftGate.structType
        ? []
        : resolvedNftGate.objectId
          ? [resolvedNftGate.objectId]
          : [];
      const ownership = await checkOwnedNftsForClient(
        suiClient,
        walletAddress,
        resolvedNftGate.structType ? [resolvedNftGate.structType] : [],
        requiredCount,
        resolvedNftGate.network,
        nftRpcUrl,
        requiredObjectIds,
        (phase) => setCheckingPhase(phase),
      );
      const nextDebugInfo: PublicNftGateDebugInfo = {
        ...ownership.diagnostic,
        checkedAt: new Date().toISOString(),
        fetchErrors: [...ownership.errors],
      };
      setDebugInfo(nextDebugInfo);
      logDebugInfo(nextDebugInfo);
      return ownership;
    })();

    publicNftOwnershipCache.set(cacheKey, {
      checkedAt: now,
      inFlight: requestPromise,
    });

    try {
      const ownership = await requestPromise;
      if (ownership.hasRequiredNft) {
        publicNftOwnershipCache.set(cacheKey, {
          checkedAt: Date.now(),
          result: ownership,
        });
      } else {
        publicNftOwnershipCache.delete(cacheKey);
      }
      setOwnedCount(ownership.matchedCount);
      setGateError("");
      setLastResolvedCheckKey(cacheKey);
      return ownership;
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "NFT check failed. Retry or switch RPC.";
      const publicError = "NFT check failed. Retry or switch RPC.";
      const nextDebugInfo = createErrorDebugInfo(walletAddress, nftGate, nftRpcUrl, nextError);
      publicNftOwnershipCache.delete(cacheKey);
      setGateError(publicError);
      setDebugInfo(nextDebugInfo);
      setLastResolvedCheckKey(cacheKey);
      logDebugInfo(nextDebugInfo);
      throw error;
    } finally {
      setIsChecking(false);
      setCheckingPhase(null);
    }
  }, [gateSelector, logDebugInfo, networkMatches, nftGate, nftRequired, nftRpcUrl, requiredCount, rpc.network, walletAddress]);

  useEffect(() => {
    if (!nftRequired || !walletAddress || !gateSelector || !networkMatches) {
      setOwnedCount(0);
      setGateError("");
      setIsChecking(false);
      setCheckingPhase(null);
      setLastResolvedCheckKey(null);
      setBaseDebugInfoIfChanged(
        setDebugInfo,
        walletAddress,
        nftGate,
        nftRpcUrl,
        !networkMatches && nftGate ? "network_mismatch" : "wallet_or_gate_not_ready",
      );
      return;
    }
  }, [gateSelector, networkMatches, nftGate, nftRequired, nftRpcUrl, walletAddress]);

  useEffect(() => {
    const previousWalletAddress = previousWalletAddressRef.current;
    const previousCacheKey = previousCacheKeyRef.current;

    if (previousWalletAddress && previousWalletAddress !== walletAddress) {
      clearOwnershipCacheForAddress(nftGate?.network, previousWalletAddress);
    }

    previousWalletAddressRef.current = walletAddress;
    previousCacheKeyRef.current = activeCheckKey;

    if (previousCacheKey === activeCheckKey) {
      return;
    }

    setLastResolvedCheckKey(null);
    setBaseDebugInfoIfChanged(
      setDebugInfo,
      walletAddress,
      nftGate,
      nftRpcUrl,
      activeCheckKey ? "awaiting_check_result" : "not_checked_yet",
    );
  }, [activeCheckKey, walletAddress, nftGate, nftRpcUrl]);

  useEffect(() => {
    if (!nftRequired || !walletAddress || !gateSelector || !networkMatches) {
      return;
    }
    void checkOwnership().catch(() => undefined);
  }, [checkOwnership, gateSelector, networkMatches, nftRequired, walletAddress]);

  const meetsRequirement = Boolean(
    nftGate &&
    walletAddress &&
    networkMatches &&
    ownedCount >= requiredCount
  );
  const canViewForm = !nftRequired || meetsRequirement;
  const viewGateActive = Boolean(nftRequired && nftGate?.gateViewing !== false);
  const submitGateActive = Boolean(nftRequired && nftGate?.gateSubmission !== false);

  const recheckAccess = useCallback(async (): Promise<PublicNftAccessCheckResult> => {
    if (!nftRequired) {
      return buildAccessCheckResult(nftGate, walletAddress, 0, true, "not_required", "not_required", debugInfo);
    }
    if (!walletAddress) {
      return buildAccessCheckResult(nftGate, walletAddress, 0, false, "wallet_missing", "wallet_missing", debugInfo);
    }
    if (!networkMatches) {
      return buildAccessCheckResult(nftGate, walletAddress, ownedCount, false, "network_mismatch", "network_mismatch", debugInfo);
    }
    try {
      const ownership = await checkOwnership({ forceFresh: true });
      const passed = Boolean(ownership?.hasRequiredNft);
      return buildAccessCheckResult(
        nftGate,
        walletAddress,
        ownership?.matchedCount ?? 0,
        passed,
        passed ? "passed" : "no_match",
        passed ? undefined : "ownership_missing",
        ownership?.diagnostic ?? debugInfo,
      );
    } catch {
      return buildAccessCheckResult(nftGate, walletAddress, ownedCount, false, "rpc_error", "rpc_error", debugInfo);
    }
  }, [checkOwnership, debugInfo, networkMatches, nftGate, nftRequired, ownedCount, walletAddress]);

  const hasResolvedOwnership = activeCheckKey !== null && lastResolvedCheckKey === activeCheckKey;
  const accessStatus: PublicNftAccessCheckResult["status"] =
    !nftRequired
      ? "not_required"
      : !walletAddress
        ? "wallet_missing"
        : !networkMatches
          ? "network_mismatch"
          : gateError
            ? "rpc_error"
            : isChecking || !hasResolvedOwnership
              ? "checking"
              : meetsRequirement
                ? "passed"
                : "no_match";

  return {
    accessMode,
    nftGate,
    nftRequired,
    viewGateActive,
    submitGateActive,
    isChecking,
    checkingPhase,
    ownedCount,
    meetsRequirement,
    canViewForm,
    hasResolvedOwnership,
    accessStatus,
    debugInfo,
    gateError: !networkMatches ? "This NFT-gated signal is configured for a different Sui network." : gateError,
    recheckAccess,
  };
}
