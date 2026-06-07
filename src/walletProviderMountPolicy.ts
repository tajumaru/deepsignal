export function shouldRequestWalletProvidersOnMountForRoute(routePath: string) {
  if (routePath === "/") {
    return false;
  }
  if (routePath === "/troubleshooting") {
    return false;
  }
  if (
    routePath.startsWith("/f/") ||
    routePath.startsWith("/roadmap/") ||
    routePath.startsWith("/m/")
  ) {
    return false;
  }
  if (routePath === "/create" || routePath === "/compose" || routePath.startsWith("/admin/forms/new")) {
    return false;
  }
  return true;
}

export function shouldRequestWalletProvidersOnMount() {
  if (typeof window === "undefined") {
    return true;
  }
  const routePath = window.location.hash?.replace(/^#/, "") || window.location.pathname;
  return shouldRequestWalletProvidersOnMountForRoute(routePath);
}
