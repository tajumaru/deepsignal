import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from "react";
import { logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { useWalletProviderRuntime } from "./components/WalletSurfaceRuntime";
import { useOptionalWalletConnection } from "./walletStatus";

export type WalletSessionPhase = "provider_deferred" | "restoring" | "disconnected" | "connected";

export interface WalletSessionState {
  accountAddress: string | null;
  isRestoringConnection: boolean;
  phase: WalletSessionPhase;
  providerLoading: boolean;
  providerMounted: boolean;
  status: "connecting" | "disconnected" | "connected";
  walletName: string | null;
}

const defaultWalletSessionState: WalletSessionState = {
  accountAddress: null,
  isRestoringConnection: false,
  phase: "provider_deferred",
  providerLoading: false,
  providerMounted: false,
  status: "disconnected",
  walletName: null,
};

const WalletSessionContext = createContext<WalletSessionState>(defaultWalletSessionState);

export function WalletSessionStateProvider({ children }: PropsWithChildren) {
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

  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}

export function useWalletSessionState() {
  return useContext(WalletSessionContext);
}
