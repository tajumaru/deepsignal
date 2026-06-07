import type { ReactNode } from "react";
import { WalletSurface } from "./components/WalletSurface";
import { RpcInfrastructureProvider } from "./RpcInfrastructureProvider";
import { WalletSessionBootstrap } from "./walletSession";
import { shouldRequestWalletProvidersOnMountForRoute } from "./walletProviderMountPolicy";

export function PrivateAppProviders({ children, routePath }: { children: ReactNode; routePath: string }) {
  return (
    <RpcInfrastructureProvider>
      <WalletSurface
        blockUntilLoaded={false}
        requestOnMount={shouldRequestWalletProvidersOnMountForRoute(routePath)}
      >
        <>
          <WalletSessionBootstrap />
          {children}
        </>
      </WalletSurface>
    </RpcInfrastructureProvider>
  );
}
