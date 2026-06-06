import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
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
import {
  SUI_NETWORK,
} from "./lib/sui";
import { getBrowserCapabilitiesSnapshot, getCurrentRoutePath, logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { endPerf, markPerfMilestone, startPerf } from "./lib/perf";
import { createBrowserSafeSuiTransport } from "./lib/suiRpcTransport";
import { useRpcInfrastructure } from "./rpcInfrastructure";
import { OptionalWalrusRuntimeBoundary } from "./WalrusRuntimeProvider";
import WalrusRuntimeBridge from "./walrusRuntimeBridge";
import type { CreateFormTransaction } from "./features/createForm/types";
import { WalletActionContext, WalletConnectionContext, type WalletConnectionState } from "./walletStatus";
import { deriveWalletConnectionState } from "./walletConnectionState";
import { setQueryClientMutationErrorHandler, setQueryClientMutationLifecycleHandler } from "./queryClient";

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

function WalletStatusBridge({ children }: PropsWithChildren) {
  const account = useCurrentAccount();
  const { currentWallet, connectionStatus, isConnected } = useCurrentWallet();
  const disconnectWallet = useDisconnectWallet();
  const signAndExecuteTransaction = useSignAndExecuteTransaction();
  const restoreInFlightRef = useRef(false);
  const value = useMemo<WalletConnectionState>(
    () =>
      deriveWalletConnectionState({
        accountAddress: account?.address,
        connectionStatus,
        currentWalletName: currentWallet?.name,
        fallbackAccounts: currentWallet?.accounts ?? null,
        isConnected,
      }),
    [account?.address, connectionStatus, currentWallet?.accounts, currentWallet?.name, isConnected],
  );

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

  return (
    <WalletActionContext.Provider value={actions}>
      <WalletConnectionContext.Provider value={value}>{children}</WalletConnectionContext.Provider>
    </WalletActionContext.Provider>
  );
}

export function WalletProviders({ children }: PropsWithChildren) {
  const rpcInfrastructure = useRpcInfrastructure();
  const currentRpcUrl = rpcInfrastructure.currentRpcUrl;
  const connectAttemptIdRef = useRef(0);
  const activeConnectAttemptIdRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);

  const clearWalletConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setQueryClientMutationErrorHandler((_error, variables) => {
      if (isSilentWalletRestore(variables)) {
        clearStaleWalletRestoreState();
      }
    });
    return () => setQueryClientMutationErrorHandler(null);
  }, []);

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

      if (event.stage === "mutate") {
        const attemptId = connectAttemptIdRef.current + 1;
        connectAttemptIdRef.current = attemptId;
        activeConnectAttemptIdRef.current = attemptId;
        clearWalletConnectTimeout();
        logRouteLifecycle("wallet-connect-click", {
          accountAddressRequested: variables.accountAddress ?? null,
          attemptId,
          routePath,
          silent: variables.silent === true,
          walletId,
          walletName,
        });
        logRouteLifecycle("wallet-connect-start", {
          accountAddressRequested: variables.accountAddress ?? null,
          attemptId,
          routePath,
          silent: variables.silent === true,
          walletId,
          walletName,
        });
        connectTimeoutRef.current = window.setTimeout(() => {
          if (activeConnectAttemptIdRef.current !== attemptId) {
            return;
          }
          logRouteLifecycle("wallet-connect-timeout", {
            attemptId,
            routePath: getCurrentRoutePath(),
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
        logRouteLifecycle("wallet-connect-success", {
          accountCount:
            event.data &&
            typeof event.data === "object" &&
            "accounts" in event.data &&
            Array.isArray((event.data as { accounts?: unknown[] }).accounts)
              ? (event.data as { accounts: unknown[] }).accounts.length
              : null,
          attemptId,
          routePath,
          silent: variables.silent === true,
          walletId,
          walletName,
        });
        return;
      }

      logRouteLifecycle("wallet-connect-error", {
        attemptId,
        error: event.error,
        routePath,
        silent: variables.silent === true,
        walletId,
        walletName,
      });
    });
    return () => {
      clearWalletConnectTimeout();
      setQueryClientMutationLifecycleHandler(null);
    };
  }, [clearWalletConnectTimeout]);

  useEffect(() => {
    logRouteLifecycle("provider-ready", {
      currentRpcUrl,
      hasRpcInfrastructure: Boolean(rpcInfrastructure),
      providerLabel: rpcInfrastructure.providerLabel,
      providerMode: rpcInfrastructure.mode,
    });
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
  );
}
