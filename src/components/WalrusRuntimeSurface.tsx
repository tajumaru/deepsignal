import { lazy, Suspense, useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { markPerfMilestone, startPerf } from "../lib/perf";
import { retryLazyImport } from "../lib/lazyRetry";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle } from "../lib/routeDiagnostics";
import { scheduleIdleTask } from "../lib/scheduleIdleTask";
import { useWalletProviderRuntime } from "./WalletSurfaceRuntime";

const WalrusRuntimeProvider = lazy(() => {
  startPerf("provider:walrus-runtime");
  markPerfMilestone("provider:walrus-runtime:import-start");
  logRouteLifecycle("provider:walrus-runtime-import-start");
  return retryLazyImport(() => import("../WalrusRuntimeProvider"), "walrus-runtime-provider").then((module) => ({
    default: module.WalrusRuntimeProvider,
  })).finally(() => {
    markPerfMilestone("provider:walrus-runtime:import-end");
    logRouteLifecycle("provider:walrus-runtime-import-end");
  });
});

interface WalrusRuntimeSurfaceProps extends PropsWithChildren {
  fallback?: ReactNode;
}

export function WalrusRuntimeSurface({ children, fallback }: WalrusRuntimeSurfaceProps) {
  const [ready, setReady] = useState(false);
  const walletRuntime = useWalletProviderRuntime();

  useEffect(
    () => scheduleIdleTask(() => setReady(true), getBrowserCapabilitiesSnapshot().mobileSafari ? 2600 : 1200),
    [],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!walletRuntime.loaded) {
      logRouteLifecycle("provider:walrus-runtime-deferred", {
        walletProviderChunkLoaded: walletRuntime.chunkLoaded,
        walletProviderLoaded: walletRuntime.loaded,
        walletProviderLoading: walletRuntime.loading,
      });
    }
  }, [ready, walletRuntime.chunkLoaded, walletRuntime.loaded, walletRuntime.loading]);

  return (
    <>
      {ready && walletRuntime.loaded ? (
        <Suspense fallback={fallback ?? null}>
          <WalrusRuntimeProvider />
        </Suspense>
      ) : null}
      {children}
    </>
  );
}
