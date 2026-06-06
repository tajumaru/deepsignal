import { useEffect, useMemo } from "react";
import { logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { useWalletProviderRuntime } from "./components/WalletSurfaceRuntime";
import { useOptionalWalletConnection } from "./walletStatus";
import {
  setWalletSessionState,
  type WalletSessionPhase,
  type WalletSessionState,
} from "./walletSessionState";

export function WalletSessionBootstrap() {
  const walletRuntime = useWalletProviderRuntime();
  const connection = useOptionalWalletConnection();

  const value = useMemo<WalletSessionState>(() => {
    const providerMounted = walletRuntime.loaded;
    const providerLoading = walletRuntime.loading;
    const phase: WalletSessionPhase = !providerMounted
      ? "provider_deferred"
      : connection.isRestoringConnection
        ? "restoring"
        : connection.status === "connected" && connection.accountAddress
          ? "connected"
          : "disconnected";

    return {
      accountAddress: connection.accountAddress,
      isRestoringConnection: connection.isRestoringConnection,
      phase,
      providerLoading,
      providerMounted,
      status: connection.status,
      walletName: connection.walletName,
    };
  }, [connection.accountAddress, connection.isRestoringConnection, connection.status, connection.walletName, walletRuntime.loaded, walletRuntime.loading]);

  useEffect(() => {
    setWalletSessionState(value);
    logRouteLifecycle("wallet-session:state", {
      phase: value.phase,
      providerLoading: value.providerLoading,
      providerMounted: value.providerMounted,
      status: value.status,
      walletName: value.walletName,
    });
    setDeepSignalDebugReadiness({
      walletProviderMounted: value.providerMounted,
      walletProviderPending: !value.providerMounted,
      walletSessionPhase: value.phase,
    });
  }, [value]);

  return null;
}
