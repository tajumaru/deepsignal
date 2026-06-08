import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  createNetworkConfig,
  SuiClientProvider,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClientContext,
  useWallets,
  WalletProvider,
} from "@mysten/dapp-kit";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import { REQUIRE_GLOBAL_WALRUS_RUNTIME } from "./lib/runtimeFlags";
import { clearWalletSessionStorage } from "./lib/walletSessionReset";
import {
  SUI_NETWORK,
} from "./lib/sui";
import { getBrowserCapabilitiesSnapshot, getCurrentRoutePath, logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { hadPriorWalletConnectChunkFailure } from "./lib/walletConnectRuntimeRecovery";
import { endPerf, markPerfMilestone, startPerf } from "./lib/perf";
import { createBrowserSafeSuiTransport } from "./lib/suiRpcTransport";
import { useRpcInfrastructure } from "./rpcInfrastructure";
import { OptionalWalrusRuntimeBoundary } from "./WalrusRuntimeProvider";
import WalrusRuntimeBridge from "./walrusRuntimeBridge";
import type { CreateFormTransaction } from "./features/createForm/types";
import {
  WalletActionContext,
  WalletConnectionContext,
  WalletRuntimeControlContext,
  type WalletConnectFailureClassification,
  type WalletConnectFailureState,
  type WalletConnectFailureSource,
  type WalletConnectionState,
} from "./walletStatus";
import { deriveWalletConnectionState } from "./walletConnectionState";
import { setQueryClientMutationErrorHandler, setQueryClientMutationLifecycleHandler } from "./queryClient";
import { getRouteRecoverySnapshot } from "./lib/routeRecoveryState";
import { useWalletProviderRuntime } from "./components/WalletSurfaceRuntime";

const PREFERRED_WALLETS = ["Sui Wallet", "Slush", "Phantom", "OKX Wallet"];
const SLUSH_WALLET_CONFIG = {
  name: "DeepSignal",
  origin: "https://deepsignal.wal.app",
};

function isWalletOptionalPublicRoute(routePath: string) {
  return (
    routePath === "/troubleshooting" ||
    routePath.startsWith("/f/") ||
    routePath.startsWith("/roadmap/") ||
    routePath.startsWith("/m/")
  );
}

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
    clearWalletSessionStorage();
    console.warn("[DeepSignal wallet] Cleared stale dApp Kit auto-connect state after restore failure.");
  } catch (error) {
    console.warn("[DeepSignal wallet] Failed to clear stale dApp Kit auto-connect state.", error);
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

function isMutationScopeItem(value: unknown): value is { baseEntity?: string; baseScope?: string } {
  return Boolean(value && typeof value === "object");
}

function isWalletConnectMutation(mutationKey: readonly unknown[], variables: unknown) {
  const hasWalletVariable = Boolean(
    variables &&
      typeof variables === "object" &&
      "wallet" in variables &&
      (variables as { wallet?: unknown }).wallet,
  );
  if (!hasWalletVariable) {
    return false;
  }
  return mutationKey.some(
    (entry) => isMutationScopeItem(entry) && entry.baseScope === "wallet" && entry.baseEntity === "connect-wallet",
  );
}

function getWalletConnectTimeoutMs() {
  return getBrowserCapabilitiesSnapshot().mobileSafari ? 15_000 : 10_000;
}

function getWalletRestoreTimeoutMs() {
  return getWalletConnectTimeoutMs();
}

function classifyWalletConnectFailureSource(error: unknown): WalletConnectFailureSource {
  const text = error instanceof Error ? `${error.name} ${error.message} ${error.stack ?? ""}` : String(error ?? "");
  if (/TRPCClientError|Failed to add dApp connection/i.test(text)) {
    return "slush_injected_provider";
  }
  if (/standard:connect|wallet adapter|wallet not found|WalletAccount/i.test(text)) {
    return "wallet_adapter";
  }
  if (/dapp-kit|connect-wallet/i.test(text)) {
    return "dapp_kit";
  }
  if (/deepsignal|wallet-connect-manual-open/i.test(text)) {
    return "wrapper";
  }
  return "unknown";
}

function classifyWalletConnectFailure(errorMessage: string, failureSource: WalletConnectFailureSource): WalletConnectFailureClassification {
  if (failureSource === "slush_injected_provider" && /Failed to add dApp connection/i.test(errorMessage)) {
    return "slush_dapp_registration_failed";
  }
  return "generic";
}

function WalletStatusBridge({ children }: PropsWithChildren) {
  const walletRuntime = useWalletProviderRuntime();
  const { chunkLoaded, markContextAvailable, markTreeMounted } = walletRuntime;
  const routePath = getCurrentRoutePath();
  const emitProviderDiagnostics = !isWalletOptionalPublicRoute(routePath);
  const account = useCurrentAccount();
  const { currentWallet, connectionStatus, isConnected } = useCurrentWallet();
  useSuiClientContext();
  const wallets = useWallets();
  const disconnectWallet = useDisconnectWallet();
  const signAndExecuteTransaction = useSignAndExecuteTransaction();
  const [manualConnectActive, setManualConnectActive] = useState(false);
  const [suppressRestoringConnection, setSuppressRestoringConnection] = useState(false);
  const [lastConnectFailure, setLastConnectFailure] = useState<WalletConnectFailureState | null>(null);
  const restoreInFlightRef = useRef(false);
  const restoreTimeoutRef = useRef<number | null>(null);
  const connectAttemptIdRef = useRef(0);
  const activeConnectAttemptIdRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const manualConnectActiveRef = useRef(false);

  const setManualConnect = useCallback((active: boolean) => {
    manualConnectActiveRef.current = active;
    setManualConnectActive(active);
  }, []);

  const setSuppressRestore = useCallback((suppressed: boolean) => {
    setSuppressRestoringConnection(suppressed);
  }, []);

  const clearWalletConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const clearWalletRestoreTimeout = useCallback(() => {
    if (restoreTimeoutRef.current !== null) {
      window.clearTimeout(restoreTimeoutRef.current);
      restoreTimeoutRef.current = null;
    }
  }, []);

  const value = useMemo<WalletConnectionState>(
    () => ({
      ...deriveWalletConnectionState({
        accountAddress: account?.address,
        connectionStatus,
        currentWalletName: currentWallet?.name,
        fallbackAccounts: currentWallet?.accounts ?? null,
        isConnected,
        manualConnectActive,
        suppressRestoringConnection,
      }),
      lastConnectFailure,
    }),
    [
      account?.address,
      connectionStatus,
      currentWallet?.accounts,
      currentWallet?.name,
      isConnected,
      lastConnectFailure,
      manualConnectActive,
      suppressRestoringConnection,
    ],
  );

  useEffect(() => {
    markTreeMounted();
    markContextAvailable();
    if (emitProviderDiagnostics) {
      logRouteLifecycle("wallet-provider-context-ready", {
        providerChunkLoaded: chunkLoaded,
        providerContextAvailable: true,
        providerTreeMounted: true,
      });
    }
    setDeepSignalDebugReadiness({
      suiClientContextAvailable: true,
      walletProviderChunkLoaded: chunkLoaded,
      walletProviderCommittedOnce: true,
      walletProviderMounted: true,
      walletProviderPending: false,
    });
  }, [chunkLoaded, emitProviderDiagnostics, markContextAvailable, markTreeMounted]);

  useEffect(() => {
    if (value.connectMode === "autoRestore" && !restoreInFlightRef.current) {
      restoreInFlightRef.current = true;
      startPerf("wallet:restoration", value.walletName ?? "wallet-auto-connect");
      markPerfMilestone("wallet:restoration:start", value.walletName ?? "wallet-auto-connect");
      logRouteLifecycle("wallet:restoration-start", {
        connectLockState: value.connectLockState,
        connectMode: value.connectMode,
        walletName: value.walletName,
        accountAddress: value.accountAddress ? "present" : "absent",
      });
    }
    if (value.connectMode === "autoRestore" && !value.accountAddress && restoreTimeoutRef.current === null) {
      const timeoutMs = getWalletRestoreTimeoutMs();
      restoreTimeoutRef.current = window.setTimeout(() => {
        restoreTimeoutRef.current = null;
        clearStaleWalletRestoreState();
        setSuppressRestore(true);
        logRouteLifecycle("wallet-restoration-timeout-reset", {
          connectLockState: value.connectLockState,
          connectMode: value.connectMode,
          timeoutMs,
          walletName: value.walletName,
        });
      }, timeoutMs);
    }
    if (value.connectMode !== "autoRestore" && restoreInFlightRef.current) {
      restoreInFlightRef.current = false;
      endPerf("wallet:restoration", value.status === "connected" ? "ok" : "failed", value.status);
      markPerfMilestone("wallet:restoration:end", value.status);
      logRouteLifecycle("wallet:restoration-end", {
        connectLockState: value.connectLockState,
        connectMode: value.connectMode,
        status: value.status,
        walletName: value.walletName,
        accountAddress: value.accountAddress ? "present" : "absent",
      });
    }
    if (value.connectMode !== "autoRestore" || value.accountAddress) {
      clearWalletRestoreTimeout();
    }
    if (emitProviderDiagnostics) {
      logRouteLifecycle("wallet-provider:status", { ...value });
    }
    setDeepSignalDebugReadiness({
      walletConnectLockState: value.connectLockState,
      walletConnectMode: value.connectMode,
      walletProvider: value.status,
      walletAccountAddress: value.accountAddress ? "present" : "absent",
      walletName: value.walletName,
      walletRestoringConnection: value.isRestoringConnection,
    });
  }, [clearWalletRestoreTimeout, emitProviderDiagnostics, setSuppressRestore, value]);

  useEffect(() => {
    if (value.status === "connected") {
      setManualConnect(false);
      setSuppressRestore(false);
      setLastConnectFailure(null);
    }
  }, [setManualConnect, setSuppressRestore, value.status]);

  useEffect(() => {
    setQueryClientMutationErrorHandler((_error, variables) => {
      if (isSilentWalletRestore(variables)) {
        clearStaleWalletRestoreState();
        setSuppressRestore(true);
      }
    });
    return () => setQueryClientMutationErrorHandler(null);
  }, [setSuppressRestore]);

  useEffect(() => {
    return () => {
      clearWalletRestoreTimeout();
    };
  }, [clearWalletRestoreTimeout]);

  useEffect(() => {
    setQueryClientMutationLifecycleHandler((event) => {
      if (!isWalletConnectMutation(event.mutationKey, event.variables)) {
        return;
      }

      const variables = event.variables as {
        accountAddress?: string;
        silent?: boolean;
        wallet?: { id?: string; name?: string };
      };
      const walletName = variables.wallet?.name ?? "unknown";
      const walletId = variables.wallet?.id ?? walletName;
      const routePath = getCurrentRoutePath();
      const connectMode = variables.silent === true ? "autoRestore" : "manual";
      const hadChunkPreloadFailure = hadPriorWalletConnectChunkFailure();

      if (event.stage === "mutate") {
        const attemptId = connectAttemptIdRef.current + 1;
        connectAttemptIdRef.current = attemptId;
        activeConnectAttemptIdRef.current = attemptId;
        clearWalletConnectTimeout();

        if (connectMode === "manual") {
          setManualConnect(true);
          setSuppressRestore(false);
          setLastConnectFailure(null);
        } else if (manualConnectActiveRef.current) {
          logRouteLifecycle("wallet-connect-auto-restore-blocked", {
            attemptId,
            connectLockState: "manual_connecting",
            connectMode,
            routePath,
            walletId,
            walletName,
          });
        }

        logRouteLifecycle("wallet-connect-click", {
          accountAddressRequested: variables.accountAddress ?? null,
          adaptersLength: wallets.length,
          attemptId,
          connectLockState: connectMode === "manual" ? "manual_connecting" : "auto_restoring",
          connectMode,
          hadChunkPreloadFailure,
          routePath,
          selectedWalletId: walletId,
          selectedWalletName: walletName,
          silent: variables.silent === true,
          walletId,
          walletName,
        });
        logRouteLifecycle("wallet-connect-start", {
          adaptersLength: wallets.length,
          accountAddressRequested: variables.accountAddress ?? null,
          attemptId,
          connectLockState: connectMode === "manual" ? "manual_connecting" : "auto_restoring",
          connectMode,
          hadChunkPreloadFailure,
          routePath,
          selectedWalletId: walletId,
          selectedWalletName: walletName,
          walletSessionPhase: connectMode === "manual" ? "manual_connect" : "restoring",
          walletStatus: "connecting",
          silent: variables.silent === true,
          walletId,
          walletName,
        });
        connectTimeoutRef.current = window.setTimeout(() => {
          if (activeConnectAttemptIdRef.current !== attemptId) {
            return;
          }
          logRouteLifecycle("wallet-connect-timeout", {
            adaptersLength: wallets.length,
            attemptId,
            buildVersion: undefined,
            connectLockState: connectMode === "manual" ? "manual_connecting" : "auto_restoring",
            connectMode,
            hadChunkPreloadFailure,
            routePath: getCurrentRoutePath(),
            selectedWalletId: walletId,
            selectedWalletName: walletName,
            silent: variables.silent === true,
            timeoutMs: getWalletConnectTimeoutMs(),
            walletId,
            walletName,
          });
        }, getWalletConnectTimeoutMs());
        return;
      }

      if (activeConnectAttemptIdRef.current === null) {
        return;
      }

      const attemptId = activeConnectAttemptIdRef.current;
      clearWalletConnectTimeout();
      activeConnectAttemptIdRef.current = null;

      if (event.stage === "success") {
        setManualConnect(false);
        setSuppressRestore(false);
        logRouteLifecycle("wallet-connect-success", {
          accountCount:
            event.data &&
            typeof event.data === "object" &&
            "accounts" in event.data &&
            Array.isArray((event.data as { accounts?: unknown[] }).accounts)
              ? (event.data as { accounts: unknown[] }).accounts.length
              : null,
          adaptersLength: wallets.length,
          attemptId,
          connectLockState: "idle",
          connectMode,
          hadChunkPreloadFailure,
          routePath,
          selectedWalletId: walletId,
          selectedWalletName: walletName,
          walletStatus: "connected",
          silent: variables.silent === true,
          walletId,
          walletName,
        });
        return;
      }

      const errorMessage = event.error instanceof Error ? event.error.message : String(event.error ?? "Unknown wallet error");
      const failureSource = classifyWalletConnectFailureSource(event.error);
      const failureClassification = classifyWalletConnectFailure(errorMessage, failureSource);
      const shouldResetFailedSession = connectMode === "manual" && failureClassification === "slush_dapp_registration_failed";
      setManualConnect(false);
      if (shouldResetFailedSession) {
        void disconnectWallet.mutateAsync().catch(() => undefined);
        clearStaleWalletRestoreState();
        setSuppressRestore(true);
      }
      setLastConnectFailure({
        classification: failureClassification,
        message: errorMessage,
        source: failureSource,
        requiresSlushRecovery: shouldResetFailedSession,
        userMessage: shouldResetFailedSession
          ? "Slush could not register this dApp connection. Open Slush, remove the old DeepSignal connection, then try again."
          : null,
        selectedWalletId: walletId,
        selectedWalletName: walletName,
      });
      const routeRecovery = getRouteRecoverySnapshot();

      logRouteLifecycle("wallet-connect-error", {
        adaptersLength: wallets.length,
        attemptId,
        classification: failureClassification,
        connectLockState: shouldResetFailedSession ? "idle" : value.connectLockState,
        connectMode,
        cssAssetError: routeRecovery.cssAssetError,
        documentVisibilityState: routeRecovery.visibilityState,
        error: event.error,
        errorClassification: failureClassification,
        errorSource: failureSource,
        failedChunkUrl: routeRecovery.failedChunkUrl,
        hadChunkPreloadFailure,
        pagehideCount: routeRecovery.pagehideCount,
        pageshowCount: routeRecovery.pageshowCount,
        pendingLabels: routeRecovery.pendingLabels,
        providerMounted: true,
        requiresSlushRecovery: shouldResetFailedSession,
        routePath,
        routeImportState: routeRecovery.phase,
        selectedWalletId: walletId,
        selectedWalletName: walletName,
        slushConnectionErrorCause: errorMessage,
        walletStatus: "disconnected",
        silent: variables.silent === true,
        walletId,
        walletName,
      });
    });
    return () => {
      clearWalletRestoreTimeout();
      clearWalletConnectTimeout();
      setQueryClientMutationLifecycleHandler(null);
    };
  }, [clearWalletConnectTimeout, clearWalletRestoreTimeout, disconnectWallet, setManualConnect, setSuppressRestore, value.connectLockState, wallets.length]);

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
      beginManualConnect: () => {
        setManualConnect(true);
        setSuppressRestore(false);
      },
      cancelManualConnect: () => {
        setManualConnect(false);
      },
      clearConnectFailure: () => {
        setLastConnectFailure(null);
      },
      suppressAutoRestore: () => {
        setSuppressRestore(true);
      },
    }),
    [setManualConnect, setSuppressRestore],
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
  const routePath = getCurrentRoutePath();
  const emitProviderDiagnostics = !isWalletOptionalPublicRoute(routePath);

  useEffect(() => {
    if (emitProviderDiagnostics) {
      logRouteLifecycle("provider-ready", {
        currentRpcUrl,
        hasRpcInfrastructure: Boolean(rpcInfrastructure),
        providerLoading: false,
        providerChunkLoaded: true,
        providerMounted: false,
        providerLabel: rpcInfrastructure.providerLabel,
        providerMode: rpcInfrastructure.mode,
      });
      logRouteLifecycle("wallet-provider-shell-ready", {
        currentRpcUrl,
        hasRpcInfrastructure: Boolean(rpcInfrastructure),
        providerLoading: false,
        providerChunkLoaded: true,
        providerMounted: false,
        providerLabel: rpcInfrastructure.providerLabel,
        providerMode: rpcInfrastructure.mode,
      });
      logRouteLifecycle("wallet-provider:ready", {
        currentRpcUrl,
        hasRpcInfrastructure: Boolean(rpcInfrastructure),
      });
    }
    setDeepSignalDebugReadiness({
      queryClientProvider: "ready",
      suiClientContextAvailable: false,
      walletProviderChunkLoaded: true,
      walletProviderShell: "ready",
      walletRpcProvider: rpcInfrastructure.providerLabel,
      walletRpcMode: rpcInfrastructure.mode,
    });
    endPerf("provider:wallet", "ok");
    markPerfMilestone("sui_client_ready", rpcInfrastructure.providerLabel);
    markPerfMilestone("provider:wallet:ready");
  }, [currentRpcUrl, emitProviderDiagnostics, rpcInfrastructure]);
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
        transport: createBrowserSafeSuiTransport(config.url),
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
      <WalletProvider
        preferredWallets={PREFERRED_WALLETS}
        walletFilter={walletFilter}
        autoConnect={false}
        slushWallet={SLUSH_WALLET_CONFIG}
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
  );
}
