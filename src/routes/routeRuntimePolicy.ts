export type RouteRuntimeMetadata = {
  optionalWallet: boolean;
  publicRoute: boolean;
  walletRequired: boolean;
};

function getPathname(routePath: string) {
  return routePath.split(/[?#]/)[0] || "/";
}

const PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/troubleshooting$/,
  /^\/f\/.+/,
  /^\/roadmap\/.+/,
  /^\/m\/.+/,
  /^\/auth\/zklogin\/.+/,
] as const;

const OPTIONAL_WALLET_PATTERNS = [
  /^\/admin$/,
  /^\/dashboard$/,
  /^\/create$/,
  /^\/compose$/,
  /^\/submitted(?:\/.*)?$/,
  /^\/my-submissions(?:\/.*)?$/,
  /^\/my-responses(?:\/.*)?$/,
  /^\/admin\/access$/,
  /^\/dashboard\/access$/,
  /^\/admin\/forms\/.+/,
  /^\/dashboard\/forms\/.+/,
  /^\/admin\/submissions\/.+/,
  /^\/dev\/insights-fixture$/,
] as const;

function matches(pathname: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(pathname));
}

export function getRouteRuntimeMetadata(routePath: string): RouteRuntimeMetadata {
  const pathname = getPathname(routePath);
  const publicRoute = matches(pathname, PUBLIC_ROUTE_PATTERNS);
  const walletRequired = false;
  const optionalWallet = !publicRoute && matches(pathname, OPTIONAL_WALLET_PATTERNS);

  return {
    optionalWallet,
    publicRoute,
    walletRequired,
  };
}

export function shouldMountWalletProviders(routePath: string) {
  const metadata = getRouteRuntimeMetadata(routePath);
  return metadata.walletRequired || metadata.optionalWallet;
}

export function shouldShowWalletUi(routePath: string) {
  const metadata = getRouteRuntimeMetadata(routePath);
  return metadata.walletRequired || metadata.optionalWallet;
}

export function usesPublicChrome(routePath: string) {
  return getRouteRuntimeMetadata(routePath).publicRoute;
}

export function requiresWorkspaceBoot(routePath: string) {
  const pathname = getPathname(routePath);
  if (usesPublicChrome(routePath)) {
    return false;
  }
  return pathname !== "/explore" && pathname !== "/signals";
}
