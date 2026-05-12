import { lazy, Suspense, type PropsWithChildren } from "react";

const WalrusRuntimeProvider = lazy(() =>
  import("../providers").then((module) => ({
    default: module.WalrusRuntimeProvider,
  })),
);

function WalrusRuntimeFallback() {
  return <div className="panel">Loading Walrus runtime...</div>;
}

export function WalrusRuntimeSurface({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={<WalrusRuntimeFallback />}>
      <WalrusRuntimeProvider>{children}</WalrusRuntimeProvider>
    </Suspense>
  );
}
