import { lazy, Suspense, type PropsWithChildren } from "react";

const WalrusRuntimeProvider = lazy(() =>
  import("../providers").then((module) => ({
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
