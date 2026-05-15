import { lazy, Suspense, type PropsWithChildren, type ReactNode } from "react";
import { retryLazyImport } from "../lib/lazyRetry";

const WalletProviders = lazy(() =>
  retryLazyImport(() => import("../providers")).then((module) => ({
    default: module.WalletProviders,
  })),
);

function WalletSurfaceFallback() {
  return <div className="panel">Loading wallet...</div>;
}

interface WalletSurfaceProps extends PropsWithChildren {
  fallback?: ReactNode;
}

export function WalletSurface({ children, fallback }: WalletSurfaceProps) {
  return (
    <Suspense fallback={fallback ?? <WalletSurfaceFallback />}>
      <WalletProviders>{children}</WalletProviders>
    </Suspense>
  );
}
