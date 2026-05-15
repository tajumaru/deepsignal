import { lazy, Suspense, type PropsWithChildren } from "react";
import { retryLazyImport } from "../lib/lazyRetry";

const WalrusRuntimeProvider = lazy(() =>
  retryLazyImport(() => import("../providers")).then((module) => ({
    default: module.WalrusRuntimeProvider,
  })),
);

export function WalrusRuntimeSurface({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={<div className="panel">Loading Walrus runtime...</div>}>
      <WalrusRuntimeProvider>{children}</WalrusRuntimeProvider>
    </Suspense>
  );
}
