import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  Component,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
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
import { logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { endPerf, markPerfMilestone, startPerf } from "./lib/perf";
import { useRpcInfrastructure } from "./rpcInfrastructure";
import WalrusRuntimeBridge from "./walrusRuntimeBridge";
import { WalletConnectionContext, type WalletConnectionState } from "./walletStatus";

const PREFERRED_WALLETS = ["Sui Wallet", "Slush", "Phantom", "OKX Wallet"];

type SuiRpcCallEntry = {
  method: string;
  startedAt: number;
  durationMs?: number;
  status: "pending" | "ok" | "failed";
  detail?: string;
};

declare global {
  interface Window {
    __DEEPSIGNAL_SUI_RPC__?: SuiRpcCallEntry[];
  }
}

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
  useEffect(() => {
    setDeepSignalDebugReadiness({ walrusRuntimeProvider: "ready" });
    endPerf("provider:walrus-runtime", "ok");
    markPerfMilestone("provider:walrus-runtime:ready");
  }, []);

  return (
    <OptionalWalrusRuntimeBoundary fallback={children}>
      <WalrusRuntimeBridge>{children}</WalrusRuntimeBridge>
    </OptionalWalrusRuntimeBoundary>
  );
}

function recordSuiRpcStart(method: string, detail?: string) {
  if (typeof window === "undefined") {
    return null;
  }
  const entry: SuiRpcCallEntry = {
    method,
    startedAt: performance.now(),
    status: "pending",
    detail,
  };
  window.__DEEPSIGNAL_SUI_RPC__ ??= [];
  window.__DEEPSIGNAL_SUI_RPC__.push(entry);
  if (window.__DEEPSIGNAL_SUI_RPC__.length > 120) {
    window.__DEEPSIGNAL_SUI_RPC__.shift();
  }
  return entry;
}

function recordSuiRpcEnd(entry: SuiRpcCallEntry | null, status: "ok" | "failed", detail?: string) {
  if (!entry || typeof performance === "undefined") {
    return;
  }
  entry.status = status;
  entry.durationMs = Math.max(0, Math.round(performance.now() - entry.startedAt));
  entry.detail = detail ?? entry.detail;
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    const suffix = entry.detail ? ` (${entry.detail})` : "";
    console.debug(`[DeepSignal Sui RPC] ${entry.method}: ${entry.durationMs}ms [${status}]${suffix}`);
  }
}

function instrumentSuiClient(client: SuiJsonRpcClient) {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || prop.startsWith("$") || typeof original !== "function") {
        return original;
      }
      return (...args: unknown[]) => {
        const entry = recordSuiRpcStart(prop);
        try {
          const result = Reflect.apply(original as (...methodArgs: unknown[]) => unknown, target, args);
          if (result && typeof result === "object" && "then" in result) {
            return (result as Promise<unknown>)
              .then((value) => {
                recordSuiRpcEnd(entry, "ok");
                return value;
              })
              .catch((error: unknown) => {
                recordSuiRpcEnd(entry, "failed", error instanceof Error ? error.message : String(error));
                throw error;
              });
          }
          recordSuiRpcEnd(entry, "ok");
          return result;
        } catch (error) {
          recordSuiRpcEnd(entry, "failed", error instanceof Error ? error.message : String(error));
          throw error;
        }
      };
    },
  }) as SuiJsonRpcClient;
}

function WalletStatusBridge({ children }: PropsWithChildren) {
  const account = useCurrentAccount();
  const { currentWallet, connectionStatus, isConnected } = useCurrentWallet();
  const wasRestoringRef = useRef(false);
  const restoreSettledRef = useRef(false);
  const value = useMemo<WalletConnectionState>(
    () => ({
      status: connectionStatus === "connecting" ? "connecting" : isConnected && account?.address ? "connected" : "disconnected",
      accountAddress: account?.address ?? null,
      walletName: currentWallet?.name ?? null,
      isRestoringConnection: connectionStatus === "connecting",
    }),
    [account?.address, connectionStatus, currentWallet?.name, isConnected],
  );

  useEffect(() => {
    if (value.isRestoringConnection && !wasRestoringRef.current && !restoreSettledRef.current) {
      wasRestoringRef.current = true;
      startPerf("wallet_restore_start", value.walletName ?? undefined);
      markPerfMilestone("wallet_restore_start", value.walletName ?? undefined);
    }
    if (!value.isRestoringConnection && wasRestoringRef.current) {
      wasRestoringRef.current = false;
      restoreSettledRef.current = true;
      endPerf("wallet_restore_start", "ok", value.status);
      markPerfMilestone("wallet_restore_end", value.status);
    }
    if (!value.isRestoringConnection && !wasRestoringRef.current && !restoreSettledRef.current) {
      restoreSettledRef.current = true;
      startPerf("wallet_restore_start", value.walletName ?? undefined);
      endPerf("wallet_restore_start", "ok", value.status);
      markPerfMilestone("wallet_restore_end", value.status);
    }
    logRouteLifecycle("wallet-provider:status", { ...value });
    setDeepSignalDebugReadiness({
      walletProvider: value.status,
      walletAccountAddress: value.accountAddress ? "present" : "absent",
      walletName: value.walletName,
      walletRestoringConnection: value.isRestoringConnection,
    });
  }, [value]);

  return <WalletConnectionContext.Provider value={value}>{children}</WalletConnectionContext.Provider>;
}

export function WalletProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const rpcInfrastructure = useRpcInfrastructure();
  const currentRpcUrl = rpcInfrastructure.currentRpcUrl;
  useEffect(() => {
    logRouteLifecycle("wallet-provider:ready", {
      currentRpcUrl,
      hasRpcInfrastructure: Boolean(rpcInfrastructure),
    });
    setDeepSignalDebugReadiness({
      walletProviderShell: "ready",
      walletRpcProvider: rpcInfrastructure.providerLabel,
      walletRpcMode: rpcInfrastructure.mode,
    });
    endPerf("provider:wallet", "ok");
    markPerfMilestone("sui_client_ready", rpcInfrastructure.providerLabel);
    markPerfMilestone("provider:wallet:ready");
  }, [currentRpcUrl, rpcInfrastructure]);
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
      instrumentSuiClient(new SuiJsonRpcClient({
        network: SUI_NETWORK,
        transport: new JsonRpcHTTPTransport({
          url: config.url,
        }),
      })),
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
