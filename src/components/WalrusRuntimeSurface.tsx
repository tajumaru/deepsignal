import { lazy, Suspense, type PropsWithChildren, type ReactNode } from "react";
import { startPerf } from "../lib/perf";
import { retryLazyImport } from "../lib/lazyRetry";

const WalrusRuntimeProvider = lazy(() => {
  startPerf("provider:walrus-runtime");
  return retryLazyImport(() => import("../providers"), "walrus-runtime-provider").then((module) => ({
    default: module.WalrusRuntimeProvider,
  }));
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
