import "@mysten/dapp-kit/dist/index.css";
import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  Component,
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  createNetworkConfig,
  SuiClientProvider,
  useCurrentAccount,
  useCurrentWallet,
  WalletProvider,
} from "@mysten/dapp-kit";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import {
  SUI_NETWORK,
} from "./lib/sui";
import { useRpcInfrastructure } from "./rpcInfrastructure";
import WalrusRuntimeBridge from "./walrusRuntimeBridge";
import { WalletConnectionContext, type WalletConnectionState } from "./walletStatus";

const PREFERRED_WALLETS = ["Sui Wallet", "Slush", "Phantom", "OKX Wallet"];

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

function WalletStatusBridge({ children }: PropsWithChildren) {
  const account = useCurrentAccount();
  const { currentWallet, connectionStatus, isConnected } = useCurrentWallet();
  const value = useMemo<WalletConnectionState>(
    () => ({
      status: connectionStatus === "connecting" ? "connecting" : isConnected && account?.address ? "connected" : "disconnected",
      accountAddress: account?.address ?? null,
      walletName: currentWallet?.name ?? null,
      isRestoringConnection: connectionStatus === "connecting",
    }),
    [account?.address, connectionStatus, currentWallet?.name, isConnected],
  );

  return <WalletConnectionContext.Provider value={value}>{children}</WalletConnectionContext.Provider>;
}

export function WalletProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const rpcInfrastructure = useRpcInfrastructure();
  const currentRpcUrl = rpcInfrastructure.currentRpcUrl;
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
  return (
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
          <WalletStatusBridge>
            {REQUIRE_GLOBAL_WALRUS_RUNTIME ? (
              <OptionalWalrusRuntimeBoundary>
                <WalrusRuntimeBridge />
              </OptionalWalrusRuntimeBoundary>
            ) : null}
            {children}
          </WalletStatusBridge>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
