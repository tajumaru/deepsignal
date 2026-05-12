import { lazy, Suspense, type PropsWithChildren } from "react";

const WalletProviders = lazy(() =>
  import("../providers").then((module) => ({
    default: module.WalletProviders,
  })),
);

function WalletSurfaceFallback() {
  return <div className="panel">Loading wallet...</div>;
}

export function WalletSurface({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={<WalletSurfaceFallback />}>
      <WalletProviders>{children}</WalletProviders>
    </Suspense>
  );
}
