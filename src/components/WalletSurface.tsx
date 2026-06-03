import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { buildInfo } from "../lib/buildInfo";
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
    return 12_000;
  }
  if (/Android|iP(?:hone|ad|od)|Mobile/i.test(userAgent)) {
    return 12_000;
  }
  return 8_000;
}

type WalletProviderImportOptions = {
  onFailure?: (details: WalletProviderImportEvent) => void;
  onSlow?: (details: WalletProviderImportEvent) => void;
};

type WalletProviderImportEvent = {
  buildVersion: string;
  mobileSafari: boolean;
  retryCount: number;
  retryKey: string | number;
  routePath: string;
  timeoutMs: number;
  userAgent: string;
};

function getCurrentRoutePath() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.hash?.replace(/^#/, "") || `${window.location.pathname}${window.location.search}`;
}

function createWalletProviders(retryKey: string | number, options: WalletProviderImportOptions = {}) {
  return lazy(() => {
    const importTimeoutMs = getWalletProviderImportTimeoutMs();
    const mobileSafari = isMobileSafari();
    const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
    const routePath = getCurrentRoutePath();
    const eventDetails: WalletProviderImportEvent = {
      buildVersion: buildInfo.appVersion,
      mobileSafari,
      retryCount: Number(retryKey) || 0,
      retryKey,
      routePath,
      timeoutMs: importTimeoutMs,
      userAgent,
    };
    startPerf("provider:wallet", `retry ${retryKey}`);
    markPerfMilestone("provider:wallet:import-start", `retry ${retryKey}`);
    logRouteLifecycle("provider:wallet-import-start", eventDetails);
    const slowTimeout = window.setTimeout(() => {
      logRouteLifecycle("provider:wallet-import-slow", {
        ...eventDetails,
        elapsedMs: 5_000,
      });
      options.onSlow?.(eventDetails);
    }, 5_000);
    const timeout = window.setTimeout(() => {
      markPerfMilestone("provider:wallet:import-timeout", `${importTimeoutMs}ms`);
      logRouteLifecycle("provider:wallet-import-timeout", eventDetails);
    }, importTimeoutMs);
    return retryLazyImport(() => import("../providers"), "wallet-providers")
      .then((module) => {
        markPerfMilestone("provider:wallet:import-resolved", `retry ${retryKey}`);
        logRouteLifecycle("provider:wallet-import-resolved", eventDetails);
        return {
          default: module.WalletProviders,
        };
      })
      .catch((error) => {
        endPerf("provider:wallet", "failed", error instanceof Error ? error.message : String(error));
        logRouteLifecycle("provider:wallet-import-failed", {
          ...eventDetails,
          chunkUrl: null,
          message: error instanceof Error ? error.message : String(error),
        });
        options.onFailure?.(eventDetails);
        throw error;
      })
      .finally(() => {
        window.clearTimeout(slowTimeout);
        window.clearTimeout(timeout);
        markPerfMilestone("provider:wallet:import-end", `retry ${retryKey}`);
        logRouteLifecycle("provider:wallet-import-end", eventDetails);
      });
  });
}

function WalletSurfaceFallback() {
  return <div className="panel">Loading wallet...</div>;
}

const WalletSurfaceContext = createContext(false);

interface WalletSurfaceProps extends PropsWithChildren {
  fallback?: ReactNode;
  onImportFailure?: (details: WalletProviderImportEvent) => void;
  onImportSlow?: (details: WalletProviderImportEvent) => void;
  retryKey?: string | number;
}

export function WalletSurface({ children, fallback, onImportFailure, onImportSlow, retryKey = 0 }: WalletSurfaceProps) {
  const hasWalletSurface = useContext(WalletSurfaceContext);
  const WalletProviders = useMemo(
    () => createWalletProviders(retryKey, { onFailure: onImportFailure, onSlow: onImportSlow }),
    [onImportFailure, onImportSlow, retryKey],
  );

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
