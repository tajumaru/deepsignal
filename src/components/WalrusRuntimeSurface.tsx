import { lazy, Suspense, type PropsWithChildren, type ReactNode } from "react";
import { markPerfMilestone, startPerf } from "../lib/perf";
import { retryLazyImport } from "../lib/lazyRetry";
import { logRouteLifecycle } from "../lib/routeDiagnostics";

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
  return (
    <Suspense fallback={fallback ?? <div className="panel">Loading Walrus runtime...</div>}>
      <WalrusRuntimeProvider>{children}</WalrusRuntimeProvider>
    </Suspense>
  );
}
