import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { WalletSurface } from "./components/WalletSurface";
import { I18nProvider } from "./i18n";
import { setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { queryClient } from "./queryClient";
import { RpcInfrastructureProvider } from "./RpcInfrastructureProvider";
import { WalletSessionBootstrap } from "./walletSession";

function redirectDirectWorkspacePathToHashRoute() {
  if (typeof window === "undefined" || window.location.hash) {
    return;
  }
  const { pathname, search } = window.location;
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/create" ||
    pathname === "/compose"
  ) {
    window.history.replaceState(null, "", `/#${pathname}${search}`);
  }
}

function shouldRequestWalletProvidersOnMount() {
  if (typeof window === "undefined") {
    return true;
  }
  const routePath = window.location.hash?.replace(/^#/, "") || window.location.pathname;
  if (routePath === "/") {
    return false;
  }
  return !(routePath === "/dashboard" || routePath.startsWith("/dashboard/"));
}

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    setDeepSignalDebugReadiness({
      queryClientProvider: "ready",
      i18nProvider: "ready",
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RpcInfrastructureProvider>
          <WalletSurface blockUntilLoaded={false} requestOnMount={shouldRequestWalletProvidersOnMount()}>
            <>
              <WalletSessionBootstrap />
              {children}
            </>
          </WalletSurface>
        </RpcInfrastructureProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export function AppRoot() {
  redirectDirectWorkspacePathToHashRoute();

  return (
    <AppProviders>
      <HashRouter>
        <App />
      </HashRouter>
    </AppProviders>
  );
}
