import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  useMemo,
  useEffect,
  useRef,
  type PropsWithChildren,
} from "react";
import {
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
} from "./lib/mystenDappKitCompat";
import { DAppKitProvider, createDAppKit } from "@mysten/dapp-kit-react";
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

const DAPP_KIT_WALLET_STORAGE_KEY = "sui-dapp-kit:wallet-connection-info";
const AUTO_RESTORE_ATTEMPTED_KEY = "deepsignal.wallet.autoRestoreAttempted";
const AUTO_RESTORE_DISABLED_KEY = "deepsignal.wallet.autoRestoreDisabled";

let autoRestoreAttemptedThisBoot = false;
let autoRestoreDisabledThisBoot = false;

function readSessionBoolean(key: string) {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSessionBoolean(key: string, value: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Best effort only.
  }
}

function isAutoRestoreSuppressed() {
  return autoRestoreDisabledThisBoot || readSessionBoolean(AUTO_RESTORE_DISABLED_KEY);
}

function shouldEnableAutoRestore() {
  if (isAutoRestoreSuppressed()) {
    return false;
  }
  if (autoRestoreAttemptedThisBoot || readSessionBoolean(AUTO_RESTORE_ATTEMPTED_KEY)) {
    return false;
  }
  return true;
}

function markAutoRestoreAttempted(reason: string) {
  autoRestoreAttemptedThisBoot = true;
  writeSessionBoolean(AUTO_RESTORE_ATTEMPTED_KEY, true);
  logRouteLifecycle("wallet:auto-restore-lock", {
    autoRestoreCallerReason: reason,
    attempted: true,
    suppressed: isAutoRestoreSuppressed(),
  });
}

function suppressAutoRestore(reason: string) {
  autoRestoreDisabledThisBoot = true;
  writeSessionBoolean(AUTO_RESTORE_DISABLED_KEY, true);
  logRouteLifecycle("wallet:auto-restore-suppressed", {
    autoRestoreCallerReason: reason,
    attempted: autoRestoreAttemptedThisBoot || readSessionBoolean(AUTO_RESTORE_ATTEMPTED_KEY),
    suppressed: true,
  });
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
    window.localStorage.removeItem(DAPP_KIT_WALLET_STORAGE_KEY);
    console.warn("[DeepSignal wallet] Cleared stale dApp Kit auto-connect state after restore failure.");
  } catch (error) {
    console.warn("[DeepSignal wallet] Failed to clear stale dApp Kit auto-connect state.", error);
  }
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
        autoRestoreCallerReason: "wallet-provider-auto-connect",
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
        autoRestoreCallerReason: "wallet-provider-auto-connect",
      });
      if (value.status !== "connected") {
        suppressAutoRestore("restore-ended-disconnected");
      }
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
  const autoConnectEnabled = shouldEnableAutoRestore();
  const dAppKit = useMemo(
    () =>
      createDAppKit({
        autoConnect: autoConnectEnabled,
        createClient: (network) =>
          new SuiJsonRpcClient({
            network: network as typeof SUI_NETWORK,
            transport: new JsonRpcHTTPTransport({
              url: currentRpcUrl,
            }),
          }),
        networks: [SUI_NETWORK] as const,
        storage: typeof window === "undefined" ? null : window.localStorage,
        storageKey: DAPP_KIT_WALLET_STORAGE_KEY,
      }),
    [autoConnectEnabled, currentRpcUrl],
  );

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
      autoRestoreCallerReason: autoConnectEnabled ? "provider-mount-auto-connect-enabled" : "provider-mount-auto-connect-skipped",
      autoRestoreEnabled: autoConnectEnabled,
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
  }, [autoConnectEnabled, currentRpcUrl, rpcInfrastructure]);

  useEffect(() => {
    if (autoConnectEnabled) {
      markAutoRestoreAttempted("wallet-provider-mounted");
      return;
    }
    logRouteLifecycle("wallet:auto-restore-skipped", {
      autoRestoreCallerReason: isAutoRestoreSuppressed() ? "suppressed" : "already-attempted",
      currentRpcUrl,
    });
  }, [autoConnectEnabled, currentRpcUrl]);

  useEffect(() => {
    startPerf("sui-rpc:client-create", currentRpcUrl);
    logRouteLifecycle("sui-rpc:client-create-start", {
      url: currentRpcUrl,
      network: SUI_NETWORK,
    });
    endPerf("sui-rpc:client-create", "ok", SUI_NETWORK);
    markPerfMilestone("sui-rpc:client-created", currentRpcUrl);
    logRouteLifecycle("sui-rpc:client-create-end", {
      url: currentRpcUrl,
      network: SUI_NETWORK,
    });
  }, [currentRpcUrl]);

  return (
    <DAppKitProvider dAppKit={dAppKit}>
        <WalletStatusBridge>
          {REQUIRE_GLOBAL_WALRUS_RUNTIME ? (
            <OptionalWalrusRuntimeBoundary>
              <WalrusRuntimeBridge />
            </OptionalWalrusRuntimeBoundary>
          ) : null}
          {children}
        </WalletStatusBridge>
    </DAppKitProvider>
  );
}
