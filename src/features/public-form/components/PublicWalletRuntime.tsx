import { lazy, Suspense, type ReactNode } from "react";
import { WalletSurface } from "../../../components/WalletSurface";
import { retryLazyImport } from "../../../lib/lazyRetry";

const LazyPublicWalletAccountPanel = lazy(() =>
  retryLazyImport(() => import("./PublicWalletAccountPanel"), "public-wallet-account").then((module) => ({
    default: module.PublicWalletAccountPanel,
  })),
);

interface PublicWalletRuntimeProps {
  className?: string;
  fallback?: ReactNode;
  hidden?: boolean;
  onAccountAddressChange: (address?: string) => void;
  onWalletProviderChange: (provider?: string) => void;
}

export function PublicWalletRuntime({
  className,
  fallback,
  hidden = false,
  onAccountAddressChange,
  onWalletProviderChange,
}: PublicWalletRuntimeProps) {
  const containerProps = hidden
    ? ({
        "aria-hidden": true,
        style: { display: "none" },
      } as const)
    : undefined;

  return (
    <WalletSurface fallback={fallback}>
      <div className={className} {...containerProps}>
        <Suspense fallback={fallback}>
          <LazyPublicWalletAccountPanel
            onAccountAddressChange={onAccountAddressChange}
            onWalletProviderChange={onWalletProviderChange}
          />
        </Suspense>
      </div>
    </WalletSurface>
  );
}
