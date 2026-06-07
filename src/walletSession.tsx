import { useEffect, useMemo } from "react";
import { logRouteLifecycle, setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { useCanonicalWalletSessionState } from "./walletCanonicalState";
import {
  setWalletSessionState,
  type WalletSessionPhase,
  type WalletSessionState,
} from "./walletSessionState";

export function WalletSessionBootstrap() {
  const canonicalSession = useCanonicalWalletSessionState();

  const value = useMemo<WalletSessionState>(() => {
    const phase: WalletSessionPhase = !canonicalSession.providerMounted
      ? "provider_deferred"
      : canonicalSession.canonicalStatus === "connecting"
        ? "restoring"
        : canonicalSession.canonicalStatus === "connected"
          ? "connected"
          : "disconnected";

    return {
      accountAddress: canonicalSession.accountAddress,
      canonicalStatus: canonicalSession.canonicalStatus,
      isRestoringConnection: canonicalSession.isRestoringConnection,
      phase,
      providerLoading: canonicalSession.providerLoading,
      providerMounted: canonicalSession.providerMounted,
      status: canonicalSession.connectionStatus,
      walletName: canonicalSession.walletName,
    };
  }, [canonicalSession]);

  useEffect(() => {
    setWalletSessionState(value);
    logRouteLifecycle("wallet-session-state", {
      providerLoading: value.providerLoading,
      providerMounted: value.providerMounted,
      walletName: value.walletName,
      walletSessionPhase: value.phase,
      walletStatus: value.canonicalStatus,
    });
    logRouteLifecycle("wallet-session:state", {
      canonicalStatus: value.canonicalStatus,
      phase: value.phase,
      providerLoading: value.providerLoading,
      providerMounted: value.providerMounted,
      status: value.status,
      walletName: value.walletName,
      walletSessionPhase: value.phase,
      walletStatus: value.canonicalStatus,
    });
    setDeepSignalDebugReadiness({
      walletProviderMounted: value.providerMounted,
      walletProviderPending: value.providerLoading || !value.providerMounted,
      walletSessionPhase: value.phase,
    });
  }, [value]);

  return null;
}
