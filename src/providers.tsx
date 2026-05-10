import "@mysten/dapp-kit/dist/index.css";
import {
  createNetworkConfig,
  SuiClientProvider,
  useCurrentAccount,
  useCurrentWallet,
  useSuiClientContext,
  WalletProvider,
} from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { walrus } from "@mysten/walrus";
import walrusWasmUrl from "@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  SUI_FULLNODE_URL,
  SUI_NETWORK,
  WALRUS_UPLOAD_RELAY_URL,
} from "./lib/sui";
import { setWalrusRuntimeContext } from "./storage/walrusAdapter";

export const REQUIRE_GLOBAL_WALRUS_RUNTIME =
  String(import.meta.env.VITE_REQUIRE_WALRUS || "").toLowerCase() === "true";
const WALRUS_TX_WAIT_TIMEOUT_MS = 3 * 60 * 1000;
const WALRUS_UPLOAD_RELAY_TIP_MAX_RAW = import.meta.env.VITE_WALRUS_UPLOAD_RELAY_TIP_MAX;
const WALRUS_UPLOAD_RELAY_TIP_MAX =
  WALRUS_UPLOAD_RELAY_TIP_MAX_RAW && WALRUS_UPLOAD_RELAY_TIP_MAX_RAW.trim()
    ? Number(WALRUS_UPLOAD_RELAY_TIP_MAX_RAW)
    : null;

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

function WalrusRuntimeBridge() {
  const account = useCurrentAccount();
  const { currentWallet, supportedIntents } = useCurrentWallet();
  const { client } = useSuiClientContext();
  const walrusClient = useMemo(
    () => {
      const walrusEnabledClient = client.$extend(
        walrus({
          wasmUrl: walrusWasmUrl,
          ...(WALRUS_UPLOAD_RELAY_URL
            ? {
              uploadRelay: {
                host: WALRUS_UPLOAD_RELAY_URL,
                ...(WALRUS_UPLOAD_RELAY_TIP_MAX != null
                  ? {
                    sendTip: {
                      max: WALRUS_UPLOAD_RELAY_TIP_MAX,
                    },
                  }
                  : {}),
              },
            }
            : {}),
        }),
      );
      const originalWaitForTransaction = walrusEnabledClient.core.waitForTransaction.bind(
        walrusEnabledClient.core,
      );
      (walrusEnabledClient.core as typeof walrusEnabledClient.core & {
        waitForTransaction: typeof walrusEnabledClient.core.waitForTransaction;
      }).waitForTransaction = (input) =>
        originalWaitForTransaction({
          ...input,
          timeout: input?.timeout ?? WALRUS_TX_WAIT_TIMEOUT_MS,
          include:
            input?.include?.effects
              ? ({
                  ...(input.include ?? {}),
                  objectTypes: true,
                } as typeof input.include)
              : input?.include,
        });
      return walrusEnabledClient;
    },
    [client],
  );

  useEffect(() => {
    setWalrusRuntimeContext({
      account,
      wallet: currentWallet,
      supportedIntents: [...supportedIntents],
      client: walrusClient,
    });

    return () => {
      setWalrusRuntimeContext({
        account: null,
        wallet: null,
        supportedIntents: [],
        client: null,
      });
    };
  }, [account, currentWallet, supportedIntents, walrusClient]);

  return null;
}

export function WalrusRuntimeProvider({ children }: PropsWithChildren) {
  return (
    <>
      <WalrusRuntimeBridge />
      {children}
    </>
  );
}

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK}>
        <WalletProvider autoConnect>
          {REQUIRE_GLOBAL_WALRUS_RUNTIME ? <WalrusRuntimeBridge /> : null}
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
