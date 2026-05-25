import { createContext, lazy, Suspense, useContext, type PropsWithChildren, type ReactNode } from "react";
import { retryLazyImport } from "../lib/lazyRetry";

const WalletProviders = lazy(() =>
  retryLazyImport(() => import("../providers"), "wallet-providers").then((module) => ({
    default: module.WalletProviders,
  })),
);

function WalletSurfaceFallback() {
  return <div className="panel">Loading wallet...</div>;
}

const WalletSurfaceContext = createContext(false);

interface WalletSurfaceProps extends PropsWithChildren {
  fallback?: ReactNode;
}

export function WalletSurface({ children, fallback }: WalletSurfaceProps) {
  const hasWalletSurface = useContext(WalletSurfaceContext);

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
