import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { HashRouter, useLocation } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import { setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import { queryClient } from "./queryClient";

const PrivateAppProviders = lazy(() =>
  import("./PrivateAppProviders").then((module) => ({
    default: module.PrivateAppProviders,
  })),
);

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
    pathname === "/compose" ||
    pathname === "/troubleshooting"
  ) {
    window.history.replaceState(null, "", `/#${pathname}${search}`);
  }
}

function shouldUsePrivateProviders(routePath: string) {
  if (routePath === "/") {
    return false;
  }
  if (routePath === "/troubleshooting") {
    return false;
  }
  return !(
    routePath.startsWith("/f/") ||
    routePath.startsWith("/roadmap/") ||
    routePath.startsWith("/m/") ||
    routePath.startsWith("/auth/zklogin/")
  );
}

function RouteAwareProviders({ children }: { children: ReactNode }) {
  const location = useLocation();
  const routePath = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    setDeepSignalDebugReadiness({
      queryClientProvider: "ready",
      i18nProvider: "ready",
    });
  }, []);

  if (!shouldUsePrivateProviders(routePath)) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={null}>
      <PrivateAppProviders routePath={routePath}>{children}</PrivateAppProviders>
    </Suspense>
  );
}

export function AppRoot() {
  redirectDirectWorkspacePathToHashRoute();

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
      <HashRouter>
        <RouteAwareProviders>
          <App />
        </RouteAwareProviders>
      </HashRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}
