import type { ReactNode } from "react";
import { WalletSurface } from "./components/WalletSurface";
import { RpcInfrastructureProvider } from "./RpcInfrastructureProvider";
import { shouldMountWalletProviders } from "./routes/routeRuntimePolicy";
import { WalletSessionBootstrap } from "./walletSession";

export function PrivateAppProviders({ children, routePath }: { children: ReactNode; routePath: string }) {
  return (
    <RpcInfrastructureProvider>
      <WalletSurface
        blockUntilLoaded={false}
        requestOnMount={shouldMountWalletProviders(routePath)}
      >
        <>
          <WalletSessionBootstrap />
          {children}
        </>
      </WalletSurface>
    </RpcInfrastructureProvider>
  );
}
