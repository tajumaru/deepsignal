import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, useLocation } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import { setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { queryClient } from "./queryClient";
import { RpcInfrastructureProvider } from "./RpcInfrastructureProvider";
import { PrivateAppProviders } from "./PrivateAppProviders";
import { getRouteRuntimeMetadata, shouldHashRoute } from "./routes/routeRuntimePolicy";

function redirectDirectWorkspacePathToHashRoute() {
  if (typeof window === "undefined" || window.location.hash) {
    return;
  }
  const { pathname, search } = window.location;
  if (shouldHashRoute(`${pathname}${search}`)) {
    window.history.replaceState(null, "", `/#${pathname}${search}`);
  }
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
          {children}
        </RpcInfrastructureProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function RouteScopedProviders() {
  const location = useLocation();
  const routePath = `${location.pathname}${location.search}${location.hash}`;
  const routeRuntimeMetadata = getRouteRuntimeMetadata(routePath);
  const routeNeedsWalletProviders = routeRuntimeMetadata.mountWalletProviders;
  const routeRequiresWallet = routeRuntimeMetadata.requiresWallet;
  const routeWantsWalletUi = routeRuntimeMetadata.showWalletUi;
  const shouldMountPrivateProvidersInitially = routeNeedsWalletProviders || routeWantsWalletUi || routeRequiresWallet;
  const [hasActivatedPrivateProviders, setHasActivatedPrivateProviders] =
    useState(shouldMountPrivateProvidersInitially);

  useEffect(() => {
    if (routeNeedsWalletProviders || routeWantsWalletUi || routeRequiresWallet) {
      setHasActivatedPrivateProviders(true);
    }
  }, [routeNeedsWalletProviders, routeRequiresWallet, routeWantsWalletUi]);

  if (!hasActivatedPrivateProviders) {
    return <App />;
  }

  return (
    <PrivateAppProviders routePath={routePath}>
      <App />
    </PrivateAppProviders>
  );
}

export function AppRoot() {
  redirectDirectWorkspacePathToHashRoute();

  return (
    <AppProviders>
      <HashRouter>
        <RouteScopedProviders />
      </HashRouter>
    </AppProviders>
  );
}
