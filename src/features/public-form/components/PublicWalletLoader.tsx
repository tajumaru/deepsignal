import { lazy, Suspense, type ReactNode } from "react";
import { retryLazyImport } from "../../../lib/lazyRetry";

const LazyPublicWalletRuntime = lazy(() =>
  retryLazyImport(() => import("./PublicWalletRuntime"), "public-wallet-runtime").then((module) => ({
    default: module.PublicWalletRuntime,
  })),
);

interface PublicWalletLoaderProps {
  className?: string;
  enabled: boolean;
  fallback?: ReactNode;
  hidden?: boolean;
  onAccountAddressChange: (address?: string) => void;
  onWalletProviderChange: (provider?: string) => void;
}

export function PublicWalletLoader({
  className,
  enabled,
  fallback,
  hidden = false,
  onAccountAddressChange,
  onWalletProviderChange,
}: PublicWalletLoaderProps) {
  if (!enabled) {
    return null;
  }

  return (
    <Suspense fallback={fallback}>
      <LazyPublicWalletRuntime
        className={className}
        fallback={fallback}
        hidden={hidden}
        onAccountAddressChange={onAccountAddressChange}
        onWalletProviderChange={onWalletProviderChange}
      />
    </Suspense>
  );
}
