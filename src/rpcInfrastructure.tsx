import { createContext, useContext } from "react";

type RpcMode = "default" | "tatum";
export const RPC_RATE_LIMIT_COOLDOWN_MS = 15_000;

export interface RpcInfrastructureContextValue {
  mode: RpcMode;
  network: "mainnet" | "testnet";
  currentRpcUrl: string;
  displayRpcUrl: string;
  defaultRpcUrl: string;
  tatumRpcUrl: string | null;
  providerLabel: string;
  usingTatum: boolean;
  canUseTatum: boolean;
  connectedNetworkLabel: string;
  setConnectedNetworkLabel: (label: string) => void;
  switchToDefault: () => void;
  switchToTatum: () => void;
  noteRateLimited: (cooldownMs?: number) => void;
  clearRateLimitedState: () => void;
  rateLimitedUntil: number;
  isRateLimitedCooldownActive: boolean;
  canAutoFallbackFromRateLimit: boolean;
}

export const RpcInfrastructureContext = createContext<RpcInfrastructureContextValue | null>(null);

let tatumRateLimitFallbackTriggered = false;

export function useRpcInfrastructure() {
  const context = useContext(RpcInfrastructureContext);
  if (!context) {
    throw new Error("useRpcInfrastructure must be used within WalletProviders.");
  }
  return context;
}

export function handleRateLimitedRpcFallback(
  rpc: RpcInfrastructureContextValue,
  error: unknown,
) {
  rpc.noteRateLimited();
  if (!rpc.usingTatum || !rpc.canAutoFallbackFromRateLimit || tatumRateLimitFallbackTriggered) {
    return false;
  }
  tatumRateLimitFallbackTriggered = true;
  console.warn("Tatum RPC rate limited; switching to default Sui RPC.", error);
  rpc.switchToDefault();
  return true;
}

export function resetRateLimitedRpcFallback() {
  tatumRateLimitFallbackTriggered = false;
}
