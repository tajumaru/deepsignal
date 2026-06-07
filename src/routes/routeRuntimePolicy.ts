function getPathname(routePath: string) {
  return routePath.split(/[?#]/)[0] || "/";
}

export function shouldMountWalletProviders(routePath: string) {
  const pathname = getPathname(routePath);

  if (
    pathname === "/" ||
    pathname === "/explore" ||
    pathname === "/signals" ||
    pathname === "/troubleshooting" ||
    pathname.startsWith("/f/") ||
    pathname.startsWith("/roadmap/") ||
    pathname.startsWith("/m/") ||
    pathname === "/create" ||
    pathname === "/compose" ||
    pathname.startsWith("/admin/forms/new")
  ) {
    return false;
  }

  return true;
}

export function shouldShowWalletUi(routePath: string) {
  const pathname = getPathname(routePath);

  return (
    pathname === "/admin" ||
    pathname === "/dashboard" ||
    pathname === "/create" ||
    pathname === "/compose" ||
    pathname === "/submitted" ||
    pathname.startsWith("/submitted/") ||
    pathname === "/my-submissions" ||
    pathname.startsWith("/my-submissions/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/dashboard/")
  );
}

export function usesPublicChrome(routePath: string) {
  const pathname = getPathname(routePath);

  return (
    pathname === "/troubleshooting" ||
    pathname.startsWith("/f/") ||
    pathname.startsWith("/roadmap/") ||
    pathname.startsWith("/m/") ||
    pathname === "/auth/zklogin/callback"
  );
}

export function requiresWorkspaceBoot(routePath: string) {
  return !usesPublicChrome(routePath) && getPathname(routePath) !== "/explore" && getPathname(routePath) !== "/signals";
}
