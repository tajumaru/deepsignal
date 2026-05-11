import "@mysten/dapp-kit/dist/index.css";
import { lazy, Suspense, useState, type PropsWithChildren } from "react";
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SUI_FULLNODE_URL, SUI_NETWORK } from "./lib/sui";

export const REQUIRE_GLOBAL_WALRUS_RUNTIME =
  String(import.meta.env.VITE_REQUIRE_WALRUS || "").toLowerCase() === "true";
const LazyWalrusRuntimeBridge = lazy(() => import("./walrusRuntimeBridge"));

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
    <Suspense fallback={<div className="panel">Loading Walrus runtime...</div>}>
      <LazyWalrusRuntimeBridge>{children}</LazyWalrusRuntimeBridge>
    </Suspense>
  );
}

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK}>
        <WalletProvider autoConnect>
          {REQUIRE_GLOBAL_WALRUS_RUNTIME ? (
            <Suspense fallback={null}>
              <LazyWalrusRuntimeBridge />
            </Suspense>
          ) : null}
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
