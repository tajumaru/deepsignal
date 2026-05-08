import "@mysten/dapp-kit/dist/index.css";
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type PropsWithChildren } from "react";
import { SUI_NETWORK, SUI_RPC_URL } from "./lib/sui";

const { networkConfig } = createNetworkConfig({
  testnet: {
    url: SUI_NETWORK === "testnet" && SUI_RPC_URL ? SUI_RPC_URL : getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  },
  mainnet: {
    url: SUI_NETWORK === "mainnet" && SUI_RPC_URL ? SUI_RPC_URL : getJsonRpcFullnodeUrl("mainnet"),
    network: "mainnet",
  },
});

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK}>
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
