import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCurrentFormNftNetwork,
  isNftGatedForm,
  normalizeFormNftGate,
  resolveFormAccessMode,
} from "../../../lib/formAccess";
import { getPreferredBrowserRpcUrl } from "../../../lib/sui";
import { useRpcInfrastructure } from "../../../rpcInfrastructure";
import type { FormSchema, FormNftGate } from "../../../types";
import type { NftOwnershipDiagnostic } from "../../../lib/nftOwnership";

const ROUTE_LEVEL_SUCCESS_CACHE_MS = 30_000;
const ROUTE_LEVEL_FAILURE_COOLDOWN_MS = 15_000;
let publicNftOwnershipLoaderPromise: Promise<{
  checkOwnedNftsForClient: typeof import("../../../lib/nftOwnership").checkOwnedNftsForClient;
  createBrowserSafeSuiTransport: typeof import("../../../lib/suiRpcTransport").createBrowserSafeSuiTransport;
  SuiJsonRpcClient: typeof import("@mysten/sui/jsonRpc").SuiJsonRpcClient;
}> | null = null;

type PublicNftOwnershipCacheEntry = {
  checkedAt: number;
  error?: string;
  inFlight?: Promise<number>;
  ownedCount: number;
};

const publicNftOwnershipCache = new Map<string, PublicNftOwnershipCacheEntry>();

type PublicNftGateDebugInfo = NftOwnershipDiagnostic & {
  lastError?: string;
};

export interface PublicNftAccessCheckResult {
  checkedAt: string;
  passed: boolean;
  reason?: "not_required" | "wallet_missing" | "network_mismatch" | "ownership_missing" | "rpc_error";
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

function buildOwnershipCacheKey(
  network: FormNftGate["network"] | undefined,
  walletAddress: string,
  structType: string,
) {
  return `${network ?? "sui-mainnet"}::${walletAddress}::${structType}`;
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
    connectedAddress: walletAddress ?? "",
    network: nftGate?.network ?? getCurrentFormNftNetwork(),
    rpcEndpoint,
    targetTypes: nftGate?.structType ? [nftGate.structType] : [],
    directOwnedCount: 0,
    kioskCount: 0,
    kioskItemCount: 0,
    directOwnedPages: [],
    kioskPages: [],
    directOwnedTypes: [],
    kioskItemTypes: [],
    kioskItemsByKiosk: [],
    requiredTypeBreakdown: [],
    typeComparisons: [],
    matchedDirectObjects: [],
    matchedKioskItems: [],
    sampleObjectTypes: [],
    zeroCountReason,
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
    lastError: error,
  };
}

async function loadPublicNftOwnershipModules() {
  if (!publicNftOwnershipLoaderPromise) {
    publicNftOwnershipLoaderPromise = Promise.all([
      import("../../../lib/nftOwnership"),
      import("../../../lib/suiRpcTransport"),
      import("@mysten/sui/jsonRpc"),
    ]).then(([nftOwnership, suiRpcTransport, suiJsonRpc]) => ({
      checkOwnedNftsForClient: nftOwnership.checkOwnedNftsForClient,
      createBrowserSafeSuiTransport: suiRpcTransport.createBrowserSafeSuiTransport,
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
  const networkMatches = !nftGate || nftGate.network === getCurrentFormNftNetwork();
  const [ownedCount, setOwnedCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [gateError, setGateError] = useState("");
  const [debugInfo, setDebugInfo] = useState<PublicNftGateDebugInfo>(() =>
    createBaseDebugInfo(walletAddress, nftGate, nftRpcUrl, "not_checked_yet"),
  );
  const [lastResolvedCheckKey, setLastResolvedCheckKey] = useState<string | null>(null);
  const previousWalletAddressRef = useRef<string | undefined>(undefined);
  const previousCacheKeyRef = useRef<string | null>(null);
  const activeCheckKey = nftRequired && walletAddress && nftGate?.structType
    ? buildOwnershipCacheKey(nftGate.network, walletAddress, nftGate.structType)
    : null;

  const logDebugInfo = useCallback((nextDebugInfo: PublicNftGateDebugInfo) => {
    console.info("[nft-gate]", nextDebugInfo);
    console.info("[nft-gate:type-compare]", {
      requiredStructType: nftGate?.structType ?? "",
      sampleObjectTypes: nextDebugInfo.sampleObjectTypes,
      matchedDirectObjects: nextDebugInfo.matchedDirectObjects,
      matchedKioskItems: nextDebugInfo.matchedKioskItems,
    });
  }, [nftGate?.structType]);

  const checkOwnership = useCallback(async (options: { forceFresh?: boolean } = {}) => {
    if (!nftRequired || !walletAddress || !nftGate?.structType || !networkMatches) {
      setOwnedCount(0);
      setGateError("");
      setIsChecking(false);
      setLastResolvedCheckKey(null);
      setDebugInfo(createBaseDebugInfo(walletAddress, nftGate, nftRpcUrl, "wallet_or_gate_not_ready"));
      return 0;
    }

    const cacheKey = buildOwnershipCacheKey(nftGate.network, walletAddress, nftGate.structType);
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
      const { checkOwnedNftsForClient, createBrowserSafeSuiTransport, SuiJsonRpcClient } =
        await loadPublicNftOwnershipModules();
      const suiClient = new SuiJsonRpcClient({
        network: rpc.network,
        transport: createBrowserSafeSuiTransport(nftRpcUrl),
      });
      const ownership = await checkOwnedNftsForClient(
        suiClient,
        walletAddress,
        [nftGate.structType],
        nftGate.network,
        nftRpcUrl,
      );
      const nextDebugInfo: PublicNftGateDebugInfo = {
        ...ownership.diagnostic,
      };
      setDebugInfo(nextDebugInfo);
      logDebugInfo(nextDebugInfo);
      return ownership.matchedCount;
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
      const nextError = error instanceof Error ? error.message : "NFT check failed. Retry or switch RPC.";
      const publicError = "NFT check failed. Retry or switch RPC.";
      const nextDebugInfo = createErrorDebugInfo(walletAddress, nftGate, nftRpcUrl, nextError);
      publicNftOwnershipCache.set(cacheKey, {
        checkedAt: Date.now(),
        error: publicError,
        ownedCount: cached?.ownedCount ?? 0,
      });
      setGateError(publicError);
      setDebugInfo(nextDebugInfo);
      setLastResolvedCheckKey(cacheKey);
      logDebugInfo(nextDebugInfo);
      throw error;
    } finally {
      setIsChecking(false);
    }
  }, [logDebugInfo, networkMatches, nftGate, nftRequired, nftRpcUrl, rpc.network, walletAddress]);

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
    setDebugInfo(createBaseDebugInfo(
      walletAddress,
      nftGate,
      nftRpcUrl,
      activeCheckKey ? "awaiting_check_result" : "not_checked_yet",
    ));
  }, [activeCheckKey, walletAddress, nftGate, nftRpcUrl]);

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
      return buildAccessCheckResult(nftGate, walletAddress, ownedCount, false, "rpc_error", debugInfo);
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
