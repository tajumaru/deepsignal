import { createContext, lazy, Suspense, useContext, useEffect, type PropsWithChildren, type ReactNode } from "react";
import { retryLazyImport } from "../lib/lazyRetry";
import { endPerf, markPerfMilestone, startPerf } from "../lib/perf";
import { logRouteLifecycle } from "../lib/routeDiagnostics";

const WALLET_PROVIDER_IMPORT_TIMEOUT_MS = 6000;

const WalletProviders = lazy(() => {
  startPerf("provider:wallet");
  markPerfMilestone("provider:wallet:import-start");
  logRouteLifecycle("provider:wallet-import-start");
  const timeout = window.setTimeout(() => {
    markPerfMilestone("provider:wallet:import-timeout", `${WALLET_PROVIDER_IMPORT_TIMEOUT_MS}ms`);
    logRouteLifecycle("provider:wallet-import-timeout", { timeoutMs: WALLET_PROVIDER_IMPORT_TIMEOUT_MS });
  }, WALLET_PROVIDER_IMPORT_TIMEOUT_MS);
  return retryLazyImport(() => import("../providers"), "wallet-providers")
    .then((module) => {
      markPerfMilestone("provider:wallet:import-resolved");
      logRouteLifecycle("provider:wallet-import-resolved");
      return {
        default: module.WalletProviders,
      };
    })
    .catch((error) => {
      endPerf("provider:wallet", "failed", error instanceof Error ? error.message : String(error));
      logRouteLifecycle("provider:wallet-import-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => {
      window.clearTimeout(timeout);
      markPerfMilestone("provider:wallet:import-end");
      logRouteLifecycle("provider:wallet-import-end");
    });
});

function WalletSurfaceFallback() {
  return <div className="panel">Loading wallet...</div>;
}

const WalletSurfaceContext = createContext(false);

interface WalletSurfaceProps extends PropsWithChildren {
  fallback?: ReactNode;
}

export function WalletSurface({ children, fallback }: WalletSurfaceProps) {
  const hasWalletSurface = useContext(WalletSurfaceContext);

  useEffect(() => {
    logRouteLifecycle(hasWalletSurface ? "wallet-surface:reuse" : "wallet-surface:mount-requested");
  }, [hasWalletSurface]);

  if (hasWalletSurface) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={fallback ?? <WalletSurfaceFallback />}>
      <WalletSurfaceContext.Provider value>
        <WalletProviders>{children}</WalletProviders>
      </WalletSurfaceContext.Provider>
    </Suspense>
  );
}
