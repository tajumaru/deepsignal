import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  getConnectedNetworkLabel,
  getEffectiveTatumRpcUrl,
  getRpcProviderLabel,
  isTatumRpcUrl,
  SUI_FALLBACK_RPC_URL,
  SUI_NETWORK,
  SUI_TATUM_RPC_URL,
} from "./lib/sui";
import {
  RPC_RATE_LIMIT_COOLDOWN_MS,
  resetRateLimitedRpcFallback,
  RpcInfrastructureContext,
  type RpcInfrastructureContextValue,
} from "./rpcInfrastructure";
import { setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";

type RpcMode = "default" | "tatum";
const TATUM_SELECTION_GRACE_MS = 4_000;

export function RpcInfrastructureProvider({ children }: PropsWithChildren) {
  const tatumRpcUrl = getEffectiveTatumRpcUrl();
  const canUseTatum = Boolean(tatumRpcUrl);
  const [rpcMode, setRpcMode] = useState<RpcMode>(() => (canUseTatum ? "tatum" : "default"));
  const [connectedNetworkLabel, setConnectedNetworkLabel] = useState(() => getConnectedNetworkLabel());
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const [manualTatumSelectionUntil, setManualTatumSelectionUntil] = useState(() =>
    canUseTatum ? Date.now() + TATUM_SELECTION_GRACE_MS : 0,
  );
  const currentRpcUrl = rpcMode === "tatum" && tatumRpcUrl ? tatumRpcUrl : SUI_FALLBACK_RPC_URL;
  const displayRpcUrl = rpcMode === "tatum" && SUI_TATUM_RPC_URL ? SUI_TATUM_RPC_URL : currentRpcUrl;

  const switchToDefault = useCallback(() => {
    setManualTatumSelectionUntil(0);
    setRpcMode("default");
  }, []);
  const clearRateLimitedState = useCallback(() => {
    setRateLimitedUntil(0);
  }, []);
  const noteRateLimited = useCallback((cooldownMs = RPC_RATE_LIMIT_COOLDOWN_MS) => {
    setRateLimitedUntil(Date.now() + Math.max(0, cooldownMs));
  }, []);
  const switchToTatum = useCallback(() => {
    if (canUseTatum) {
      resetRateLimitedRpcFallback();
      clearRateLimitedState();
      setManualTatumSelectionUntil(Date.now() + TATUM_SELECTION_GRACE_MS);
      setRpcMode("tatum");
    }
  }, [canUseTatum, clearRateLimitedState]);
  const setNetworkLabel = useCallback((label: string) => {
    setConnectedNetworkLabel((current) => (current === label ? current : label));
  }, []);
  const isRateLimitedCooldownActive = rateLimitedUntil > Date.now();
  const canAutoFallbackFromRateLimit = manualTatumSelectionUntil <= Date.now();

  useEffect(() => {
    if (!rateLimitedUntil || !isRateLimitedCooldownActive) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setRateLimitedUntil((current) => (current <= Date.now() ? 0 : current));
    }, Math.max(0, rateLimitedUntil - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [isRateLimitedCooldownActive, rateLimitedUntil]);

  useEffect(() => {
    if (!manualTatumSelectionUntil || canAutoFallbackFromRateLimit) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setManualTatumSelectionUntil((current) => (current <= Date.now() ? 0 : current));
    }, Math.max(0, manualTatumSelectionUntil - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [canAutoFallbackFromRateLimit, manualTatumSelectionUntil]);

  const rpcInfrastructure = useMemo<RpcInfrastructureContextValue>(
    () => ({
      mode: rpcMode,
      network: SUI_NETWORK,
      currentRpcUrl,
      displayRpcUrl,
      defaultRpcUrl: SUI_FALLBACK_RPC_URL,
      tatumRpcUrl: SUI_TATUM_RPC_URL && isTatumRpcUrl(SUI_TATUM_RPC_URL) ? SUI_TATUM_RPC_URL : null,
      providerLabel: getRpcProviderLabel(displayRpcUrl),
      usingTatum: rpcMode === "tatum" && isTatumRpcUrl(displayRpcUrl),
      canUseTatum,
      connectedNetworkLabel,
      setConnectedNetworkLabel: setNetworkLabel,
      switchToDefault,
      switchToTatum,
      noteRateLimited,
      clearRateLimitedState,
      rateLimitedUntil,
      isRateLimitedCooldownActive,
      canAutoFallbackFromRateLimit,
    }),
    [
      canAutoFallbackFromRateLimit,
      canUseTatum,
      clearRateLimitedState,
      connectedNetworkLabel,
      currentRpcUrl,
      displayRpcUrl,
      isRateLimitedCooldownActive,
      noteRateLimited,
      rateLimitedUntil,
      rpcMode,
      setNetworkLabel,
      switchToDefault,
      switchToTatum,
    ],
  );

  useEffect(() => {
    setDeepSignalDebugReadiness({
      rpcInfrastructureProvider: "ready",
      rpcMode,
      rpcProviderLabel: rpcInfrastructure.providerLabel,
      rateLimited: isRateLimitedCooldownActive,
    });
  }, [isRateLimitedCooldownActive, rpcInfrastructure.providerLabel, rpcMode]);

  return <RpcInfrastructureContext.Provider value={rpcInfrastructure}>{children}</RpcInfrastructureContext.Provider>;
}
