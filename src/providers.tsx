import "@mysten/dapp-kit/dist/index.css";
import { Component, useState, type PropsWithChildren, type ReactNode } from "react";
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import { SUI_FULLNODE_URL, SUI_NETWORK } from "./lib/sui";
import WalrusRuntimeBridge from "./walrusRuntimeBridge";

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

const { networkConfig } = createNetworkConfig({
  testnet: {
    url:
      SUI_NETWORK === "testnet" && SUI_FULLNODE_URL
        ? SUI_FULLNODE_URL
        : getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  },
  mainnet: {
    url:
      SUI_NETWORK === "mainnet" && SUI_FULLNODE_URL
        ? SUI_FULLNODE_URL
        : getJsonRpcFullnodeUrl("mainnet"),
    network: "mainnet",
  },
});

export function WalrusRuntimeProvider({ children }: PropsWithChildren) {
  return (
    <OptionalWalrusRuntimeBoundary fallback={children}>
      <WalrusRuntimeBridge>{children}</WalrusRuntimeBridge>
    </OptionalWalrusRuntimeBoundary>
  );
}

export function WalletProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK}>
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
  );
}
