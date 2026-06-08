import { useMemo, useState, type ReactNode } from "react";
import { WalletSurface } from "./components/WalletSurface";
import { RpcInfrastructureProvider } from "./RpcInfrastructureProvider";
import { shouldMountWalletProviders } from "./routes/routeRuntimePolicy";
import { WalletSessionBootstrap } from "./walletSession";
import { WalletProviderResetContext } from "./walletProviderReset";

export function PrivateAppProviders({ children, routePath }: { children: ReactNode; routePath: string }) {
  const [walletProviderRetryKey, setWalletProviderRetryKey] = useState(0);
  const walletProviderReset = useMemo(
    () => ({
      remountWalletProvider: () => {
        setWalletProviderRetryKey((value) => value + 1);
      },
    }),
    [],
  );

  return (
    <WalletProviderResetContext.Provider value={walletProviderReset}>
      <RpcInfrastructureProvider>
        <WalletSurface
          key={`wallet-surface:${walletProviderRetryKey}`}
          blockUntilLoaded={false}
          requestOnMount={shouldMountWalletProviders(routePath)}
          retryKey={walletProviderRetryKey}
        >
          <>
            <WalletSessionBootstrap />
            {children}
          </>
        </WalletSurface>
      </RpcInfrastructureProvider>
    </WalletProviderResetContext.Provider>
  );
}
