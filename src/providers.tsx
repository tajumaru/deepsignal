import "@mysten/dapp-kit/dist/index.css";
import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import {
  getConnectedNetworkLabel,
  getEffectiveTatumRpcUrl,
  getRpcProviderLabel,
  isTatumRpcUrl,
  SUI_DEFAULT_RPC_URL,
  SUI_FULLNODE_URL,
  SUI_NETWORK,
} from "./lib/sui";
import {
  RPC_RATE_LIMIT_COOLDOWN_MS,
  resetRateLimitedRpcFallback,
  RpcInfrastructureContext,
  type RpcInfrastructureContextValue,
} from "./rpcInfrastructure";
import WalrusRuntimeBridge from "./walrusRuntimeBridge";

const PREFERRED_WALLETS = ["Sui Wallet", "Slush", "Phantom", "OKX Wallet"];
type RpcMode = "default" | "tatum";
const TATUM_SELECTION_GRACE_MS = 4_000;

class OptionalWalrusRuntimeBoundary extends Component<
  PropsWithChildren<{ fallback?: ReactNode }>,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("Walrus runtime failed to initialize; continuing with local fallback.", error);
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}

function walletFilter(wallet: WalletWithRequiredFeatures) {
  if (wallet.name.toLowerCase().includes("nightly")) {
    return false;
  }
  return Boolean(
    wallet.features["sui:signTransaction"] || wallet.features["sui:signTransactionBlock"],
  );
}

export function WalrusRuntimeProvider({ children }: PropsWithChildren) {
  return (
    <OptionalWalrusRuntimeBoundary fallback={children}>
      <WalrusRuntimeBridge>{children}</WalrusRuntimeBridge>
    </OptionalWalrusRuntimeBoundary>
  );
}

export function WalletProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const tatumRpcUrl = getEffectiveTatumRpcUrl();
  const canUseTatum = Boolean(tatumRpcUrl);
  const [rpcMode, setRpcMode] = useState<RpcMode>(() => (canUseTatum ? "tatum" : "default"));
  const [connectedNetworkLabel, setConnectedNetworkLabel] = useState(() => getConnectedNetworkLabel());
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const [manualTatumSelectionUntil, setManualTatumSelectionUntil] = useState(() =>
    canUseTatum ? Date.now() + TATUM_SELECTION_GRACE_MS : 0,
  );
  const currentRpcUrl = rpcMode === "tatum" && tatumRpcUrl ? tatumRpcUrl : SUI_DEFAULT_RPC_URL;
  const displayRpcUrl = rpcMode === "tatum" && SUI_FULLNODE_URL ? SUI_FULLNODE_URL : currentRpcUrl;
  const { networkConfig } = useMemo(
    () =>
      createNetworkConfig({
        [SUI_NETWORK]: {
          url: currentRpcUrl,
          network: SUI_NETWORK,
        },
      }),
    [currentRpcUrl],
  );
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
  const createClient = useCallback(
    (
      _name: string | number,
      config: Readonly<{ url: string; network: "mainnet" | "testnet" }>,
    ) =>
      new SuiJsonRpcClient({
        network: SUI_NETWORK,
        transport: new JsonRpcHTTPTransport({
          url: config.url,
        }),
      }),
    [],
  );
  const rpcInfrastructure = useMemo<RpcInfrastructureContextValue>(
    () => ({
      mode: rpcMode,
      network: SUI_NETWORK,
      currentRpcUrl,
      displayRpcUrl,
      defaultRpcUrl: SUI_DEFAULT_RPC_URL,
      tatumRpcUrl: SUI_FULLNODE_URL && isTatumRpcUrl(SUI_FULLNODE_URL) ? SUI_FULLNODE_URL : null,
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
      clearRateLimitedState,
      canUseTatum,
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

  return (
    <RpcInfrastructureContext.Provider value={rpcInfrastructure}>
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider
          networks={networkConfig}
          network={SUI_NETWORK}
          createClient={createClient}
        >
          <WalletProvider
            preferredWallets={PREFERRED_WALLETS}
            walletFilter={walletFilter}
            autoConnect
          >
            {REQUIRE_GLOBAL_WALRUS_RUNTIME ? (
              <OptionalWalrusRuntimeBoundary>
                <WalrusRuntimeBridge />
              </OptionalWalrusRuntimeBoundary>
            ) : null}
            {children}
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </RpcInfrastructureContext.Provider>
  );
}
