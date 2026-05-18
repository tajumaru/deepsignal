import "@mysten/dapp-kit/dist/index.css";
import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  Component,
  createContext,
  useCallback,
  useContext,
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
import WalrusRuntimeBridge from "./walrusRuntimeBridge";

const PREFERRED_WALLETS = ["Sui Wallet", "Slush", "Phantom", "OKX Wallet"];
type RpcMode = "default" | "tatum";

interface RpcInfrastructureContextValue {
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
}

const RpcInfrastructureContext = createContext<RpcInfrastructureContextValue | null>(null);
let tatumRateLimitFallbackTriggered = false;

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
  if (!rpc.usingTatum || tatumRateLimitFallbackTriggered) {
    return false;
  }
  tatumRateLimitFallbackTriggered = true;
  console.warn("Tatum RPC rate limited; switching to default Sui RPC.", error);
  rpc.switchToDefault();
  return true;
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
  const [rpcMode, setRpcMode] = useState<RpcMode>("default");
  const [connectedNetworkLabel, setConnectedNetworkLabel] = useState(() => getConnectedNetworkLabel());
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
    setRpcMode("default");
  }, []);
  const switchToTatum = useCallback(() => {
    if (canUseTatum) {
      tatumRateLimitFallbackTriggered = false;
      setRpcMode("tatum");
    }
  }, [canUseTatum]);
  const setNetworkLabel = useCallback((label: string) => {
    setConnectedNetworkLabel((current) => (current === label ? current : label));
  }, []);
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
    }),
    [
      canUseTatum,
      connectedNetworkLabel,
      currentRpcUrl,
      displayRpcUrl,
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
