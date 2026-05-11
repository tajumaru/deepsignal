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
import { WalrusDiagnosticError, getWalrusErrorMessage } from "./storage/walrusDiagnostics";
import { setWalrusRuntimeContext } from "./storage/walrusAdapter";

export const REQUIRE_GLOBAL_WALRUS_RUNTIME =
  String(import.meta.env.VITE_REQUIRE_WALRUS || "").toLowerCase() === "true";
const WALRUS_TX_WAIT_TIMEOUT_MS = 3 * 60 * 1000;
const WALRUS_UPLOAD_RELAY_TIMEOUT_RAW = import.meta.env.VITE_WALRUS_UPLOAD_RELAY_TIMEOUT_MS;
const WALRUS_UPLOAD_RELAY_TIMEOUT_MS =
  WALRUS_UPLOAD_RELAY_TIMEOUT_RAW && WALRUS_UPLOAD_RELAY_TIMEOUT_RAW.trim()
    ? Number(WALRUS_UPLOAD_RELAY_TIMEOUT_RAW)
    : 90 * 1000;
const WALRUS_UPLOAD_RELAY_TIP_MAX_RAW = import.meta.env.VITE_WALRUS_UPLOAD_RELAY_TIP_MAX;
const WALRUS_UPLOAD_RELAY_TIP_MAX =
  WALRUS_UPLOAD_RELAY_TIP_MAX_RAW && WALRUS_UPLOAD_RELAY_TIP_MAX_RAW.trim()
    ? Number(WALRUS_UPLOAD_RELAY_TIP_MAX_RAW)
    : null;

function buildWaitForTransactionTimeoutError(digest: string, timeoutMs: number, lastError: unknown) {
  const lastRpcError = getWalrusErrorMessage(lastError);
  const timeoutSeconds = Math.round(timeoutMs / 1000);
  const message =
    `Walrus transaction submitted, but RPC visibility timed out after ${timeoutSeconds}s.` +
    ` digest=${digest}` +
    (lastRpcError ? ` lastRpcError=${lastRpcError}` : "");
  return new WalrusDiagnosticError(
    message,
    {
      stage: "rpc-visibility",
      digest,
      lastRpcError,
      timeoutMs,
    },
    lastError,
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
                timeout: WALRUS_UPLOAD_RELAY_TIMEOUT_MS,
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
      (walrusEnabledClient.core as typeof walrusEnabledClient.core & {
        waitForTransaction: typeof walrusEnabledClient.core.waitForTransaction;
      }).waitForTransaction = async (input) => {
        const timeout = input?.timeout ?? WALRUS_TX_WAIT_TIMEOUT_MS;
        const include =
          input?.include?.effects
            ? ({
                ...(input.include ?? {}),
                objectTypes: true,
              } as typeof input.include)
            : input?.include;
        const digest =
          "result" in input && input.result
            ? (input.result.Transaction ?? input.result.FailedTransaction)?.digest
            : input.digest;
        const schedule = input?.pollSchedule ?? [0, 300, 600, 1500, 3500];
        const lastInterval =
          schedule.length > 0 ? schedule[schedule.length - 1] - (schedule[schedule.length - 2] ?? 0) : 2000;
        const abortSignal = input?.signal
          ? AbortSignal.any([AbortSignal.timeout(timeout), input.signal])
          : AbortSignal.timeout(timeout);
        const abortPromise = new Promise<never>((_, reject) => {
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason));
        });
        abortPromise.catch(() => {});

        const startedAt = Date.now();
        let scheduleIndex = 0;
        let lastGetTransactionError: unknown;

        try {
          while (true) {
            if (scheduleIndex < schedule.length) {
              const remaining = startedAt + schedule[scheduleIndex] - Date.now();
              scheduleIndex += 1;
              if (remaining > 0) {
                await Promise.race([new Promise((resolve) => setTimeout(resolve, remaining)), abortPromise]);
              }
            } else {
              await Promise.race([new Promise((resolve) => setTimeout(resolve, lastInterval)), abortPromise]);
            }

            abortSignal.throwIfAborted();
            try {
              return await walrusEnabledClient.core.getTransaction({
                digest,
                include,
                signal: abortSignal,
              });
            } catch (error) {
              lastGetTransactionError = error;
            }
          }
        } catch (error) {
          if (digest && error instanceof Error && error.name === "TimeoutError") {
            throw buildWaitForTransactionTimeoutError(digest, timeout, lastGetTransactionError ?? error);
          }
          throw error;
        }
      };
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
