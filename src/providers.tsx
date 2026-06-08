import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type PropsWithChildren,
} from "react";
import {
  createNetworkConfig,
  SuiClientProvider,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  WalletProvider,
} from "@mysten/dapp-kit";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import { SUI_NETWORK } from "./lib/sui";
import { logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { endPerf, markPerfMilestone, startPerf } from "./lib/perf";
import { useRpcInfrastructure } from "./rpcInfrastructure";
import { OptionalWalrusRuntimeBoundary } from "./WalrusRuntimeProvider";
import WalrusRuntimeBridge from "./walrusRuntimeBridge";
import type { CreateFormTransaction } from "./features/createForm/types";
import {
  WalletActionContext,
  WalletConnectionContext,
  WalletRuntimeControlContext,
  type WalletConnectionState,
} from "./walletStatus";
import { setQueryClientMutationErrorHandler } from "./queryClient";
import { useWalletProviderRuntime } from "./components/WalletSurfaceRuntime";

const PREFERRED_WALLETS = ["Sui Wallet", "Slush", "Phantom", "OKX Wallet"];
const DAPP_KIT_WALLET_STORAGE_KEY = "sui-dapp-kit:wallet-connection-info";

function isSilentWalletRestore(variables: unknown): variables is { silent: true } {
  return Boolean(
    variables &&
      typeof variables === "object" &&
      "silent" in variables &&
      (variables as { silent?: unknown }).silent === true,
  );
}

function clearStaleWalletRestoreState() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(DAPP_KIT_WALLET_STORAGE_KEY);
    console.warn("[DeepSignal wallet] Cleared stale dApp Kit auto-connect state after restore failure.");
  } catch (error) {
    console.warn("[DeepSignal wallet] Failed to clear stale dApp Kit auto-connect state.", error);
  }
}

function walletFilter(wallet: WalletWithRequiredFeatures) {
  if (wallet.name.toLowerCase().includes("nightly")) {
    return false;
  }
  return Boolean(wallet.features["sui:signTransaction"] || wallet.features["sui:signTransactionBlock"]);
}

function WalletStatusBridge({ children }: PropsWithChildren) {
  const walletRuntime = useWalletProviderRuntime();
  const { chunkLoaded, markContextAvailable, markTreeMounted } = walletRuntime;
  const account = useCurrentAccount();
  const { currentWallet, connectionStatus, isConnected } = useCurrentWallet();
  const disconnectWallet = useDisconnectWallet();
  const signAndExecuteTransaction = useSignAndExecuteTransaction();
  const restoreInFlightRef = useRef(false);

  const value = useMemo<WalletConnectionState>(
    () => ({
      status: connectionStatus === "connecting" ? "connecting" : isConnected && account?.address ? "connected" : "disconnected",
      accountAddress: account?.address ?? null,
      walletName: currentWallet?.name ?? null,
      isRestoringConnection: connectionStatus === "connecting",
      connectMode: connectionStatus === "connecting" ? "autoRestore" : null,
      connectLockState: connectionStatus === "connecting" ? "auto_restoring" : "idle",
      lastConnectFailure: null,
    }),
    [account?.address, connectionStatus, currentWallet?.name, isConnected],
  );

  useEffect(() => {
    markTreeMounted();
    markContextAvailable();
    setDeepSignalDebugReadiness({
      suiClientContextAvailable: true,
      walletProviderChunkLoaded: chunkLoaded,
      walletProviderCommittedOnce: true,
      walletProviderMounted: true,
      walletProviderPending: false,
    });
  }, [chunkLoaded, markContextAvailable, markTreeMounted]);

  useEffect(() => {
    if (value.isRestoringConnection && !restoreInFlightRef.current) {
      restoreInFlightRef.current = true;
      startPerf("wallet:restoration", value.walletName ?? "wallet-auto-connect");
      markPerfMilestone("wallet:restoration:start", value.walletName ?? "wallet-auto-connect");
      logRouteLifecycle("wallet:restoration-start", {
        walletName: value.walletName,
        accountAddress: value.accountAddress ? "present" : "absent",
      });
    }
    if (!value.isRestoringConnection && restoreInFlightRef.current) {
      restoreInFlightRef.current = false;
      endPerf("wallet:restoration", value.status === "connected" ? "ok" : "failed", value.status);
      markPerfMilestone("wallet:restoration:end", value.status);
      logRouteLifecycle("wallet:restoration-end", {
        status: value.status,
        walletName: value.walletName,
        accountAddress: value.accountAddress ? "present" : "absent",
      });
    }
    logRouteLifecycle("wallet-provider:status", { ...value });
    setDeepSignalDebugReadiness({
      walletConnectLockState: value.connectLockState,
      walletConnectMode: value.connectMode,
      walletProvider: value.status,
      walletAccountAddress: value.accountAddress ? "present" : "absent",
      walletName: value.walletName,
      walletRestoringConnection: value.isRestoringConnection,
    });
  }, [value]);

  const actions = useMemo(
    () => ({
      disconnect: async () => {
        await disconnectWallet.mutateAsync();
      },
      signAndExecuteTransaction: async (transaction: CreateFormTransaction) => {
        return signAndExecuteTransaction.mutateAsync({
          transaction,
        });
      },
    }),
    [disconnectWallet, signAndExecuteTransaction],
  );

  const runtimeControls = useMemo(
    () => ({
      beginManualConnect: () => undefined,
      cancelManualConnect: () => undefined,
      clearConnectFailure: () => undefined,
      suppressAutoRestore: () => undefined,
    }),
    [],
  );

  return (
    <WalletRuntimeControlContext.Provider value={runtimeControls}>
      <WalletActionContext.Provider value={actions}>
        <WalletConnectionContext.Provider value={value}>{children}</WalletConnectionContext.Provider>
      </WalletActionContext.Provider>
    </WalletRuntimeControlContext.Provider>
  );
}

export function WalletProviders({ children }: PropsWithChildren) {
  const rpcInfrastructure = useRpcInfrastructure();
  const currentRpcUrl = rpcInfrastructure.currentRpcUrl;

  useEffect(() => {
    setQueryClientMutationErrorHandler((_error, variables) => {
      if (isSilentWalletRestore(variables)) {
        clearStaleWalletRestoreState();
      }
    });
    return () => setQueryClientMutationErrorHandler(null);
  }, []);

  useEffect(() => {
    logRouteLifecycle("wallet-provider:ready", {
      currentRpcUrl,
      hasRpcInfrastructure: Boolean(rpcInfrastructure),
    });
    setDeepSignalDebugReadiness({
      queryClientProvider: "ready",
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
    ) => {
      startPerf("sui-rpc:client-create", config.url);
      logRouteLifecycle("sui-rpc:client-create-start", {
        url: config.url,
        network: config.network,
      });
      const rpcClient = new SuiJsonRpcClient({
        network: SUI_NETWORK,
        transport: new JsonRpcHTTPTransport({
          url: config.url,
        }),
      });
      endPerf("sui-rpc:client-create", "ok", config.network);
      markPerfMilestone("sui-rpc:client-created", config.url);
      logRouteLifecycle("sui-rpc:client-create-end", {
        url: config.url,
        network: config.network,
      });
      return rpcClient;
    },
    [],
  );

  return (
    <SuiClientProvider
      networks={networkConfig}
      network={SUI_NETWORK}
      createClient={createClient}
    >
      <WalletProvider preferredWallets={PREFERRED_WALLETS} walletFilter={walletFilter} autoConnect>
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
  );
}
