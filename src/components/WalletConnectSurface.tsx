import { lazy, Suspense, type ReactNode } from "react";
import "../styles/components/wallet-network.css";
import { retryLazyImport } from "../lib/lazyRetry";

const WalletConnect = lazy(() =>
  retryLazyImport(() => import("./WalletConnect"), "wallet-connect").then((module) => ({ default: module.WalletConnect })),
);

interface WalletConnectSurfaceProps {
  compact?: boolean;
  fallback?: ReactNode;
  surface?: "default" | "mobileDrawer";
}

function WalletConnectFallback({ compact = false }: { compact?: boolean }) {
  return <div className={`wallet-connect-shell ${compact ? "wallet-connect-shell-compact" : ""}`.trim()} />;
}

export function WalletConnectSurface({ compact = false, fallback, surface = "default" }: WalletConnectSurfaceProps) {
  return (
    <Suspense fallback={fallback ?? <WalletConnectFallback compact={compact} />}>
      <WalletConnect compact={compact} surface={surface} />
    </Suspense>
  );
}
