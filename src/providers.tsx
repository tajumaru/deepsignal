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
