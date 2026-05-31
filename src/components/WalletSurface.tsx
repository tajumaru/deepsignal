import { createContext, lazy, Suspense, useContext, useEffect, type PropsWithChildren, type ReactNode } from "react";
import { retryLazyImport } from "../lib/lazyRetry";
import { markPerfMilestone, startPerf } from "../lib/perf";
import { logRouteLifecycle } from "../lib/routeDiagnostics";

const WalletProviders = lazy(() => {
  startPerf("provider:wallet");
  markPerfMilestone("provider:wallet:import-start");
  logRouteLifecycle("provider:wallet-import-start");
  return retryLazyImport(() => import("../providers"), "wallet-providers").then((module) => ({
    default: module.WalletProviders,
  })).finally(() => {
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
