import { createContext, lazy, Suspense, useContext, useEffect, useMemo, type PropsWithChildren, type ReactNode } from "react";
import { retryLazyImport } from "../lib/lazyRetry";
import { endPerf, markPerfMilestone, startPerf } from "../lib/perf";
import { logRouteLifecycle } from "../lib/routeDiagnostics";

function isMobileSafari() {
  if (typeof navigator === "undefined") {
    return false;
  }
  const userAgent = navigator.userAgent;
  return /iP(?:hone|ad|od)/.test(userAgent) && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(userAgent);
}

function getWalletProviderImportTimeoutMs() {
  if (typeof navigator === "undefined") {
    return 8_000;
  }
  const userAgent = navigator.userAgent;
  if (isMobileSafari()) {
    return 15_000;
  }
  if (/Android|iP(?:hone|ad|od)|Mobile/i.test(userAgent)) {
    return 12_000;
  }
  return 8_000;
}

function createWalletProviders(retryKey: string | number) {
  return lazy(() => {
    const importTimeoutMs = getWalletProviderImportTimeoutMs();
    startPerf("provider:wallet", `retry ${retryKey}`);
    markPerfMilestone("provider:wallet:import-start", `retry ${retryKey}`);
    logRouteLifecycle("provider:wallet-import-start", { retryKey, timeoutMs: importTimeoutMs });
    const timeout = window.setTimeout(() => {
      markPerfMilestone("provider:wallet:import-timeout", `${importTimeoutMs}ms`);
      logRouteLifecycle("provider:wallet-import-timeout", { retryKey, timeoutMs: importTimeoutMs });
    }, importTimeoutMs);
    return retryLazyImport(() => import("../providers"), "wallet-providers")
      .then((module) => {
        markPerfMilestone("provider:wallet:import-resolved", `retry ${retryKey}`);
        logRouteLifecycle("provider:wallet-import-resolved", { retryKey });
        return {
          default: module.WalletProviders,
        };
      })
      .catch((error) => {
        endPerf("provider:wallet", "failed", error instanceof Error ? error.message : String(error));
        logRouteLifecycle("provider:wallet-import-failed", {
          retryKey,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      })
      .finally(() => {
        window.clearTimeout(timeout);
        markPerfMilestone("provider:wallet:import-end", `retry ${retryKey}`);
        logRouteLifecycle("provider:wallet-import-end", { retryKey });
      });
  });
}

function WalletSurfaceFallback() {
  return <div className="panel">Loading wallet...</div>;
}

const WalletSurfaceContext = createContext(false);

interface WalletSurfaceProps extends PropsWithChildren {
  fallback?: ReactNode;
  retryKey?: string | number;
}

export function WalletSurface({ children, fallback, retryKey = 0 }: WalletSurfaceProps) {
  const hasWalletSurface = useContext(WalletSurfaceContext);
  const WalletProviders = useMemo(() => createWalletProviders(retryKey), [retryKey]);

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
