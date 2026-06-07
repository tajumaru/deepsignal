import { shouldMountWalletProviders } from "./routes/routeRuntimePolicy";

export function shouldRequestWalletProvidersOnMountForRoute(routePath: string) {
  return shouldMountWalletProviders(routePath);
}

export function shouldRequestWalletProvidersOnMount() {
  if (typeof window === "undefined") {
    return true;
  }
  const routePath = window.location.hash?.replace(/^#/, "") || window.location.pathname;
  return shouldRequestWalletProvidersOnMountForRoute(routePath);
}
