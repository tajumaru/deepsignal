import { useEffect, type ReactNode } from "react";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import { setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";

function redirectDirectWorkspacePathToHashRoute() {
  if (typeof window === "undefined" || window.location.hash) {
    return;
  }
  const { pathname, search } = window.location;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    window.history.replaceState(null, "", `/#${pathname}${search}`);
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    setDeepSignalDebugReadiness({ i18nProvider: "ready" });
  }, []);

  return <I18nProvider>{children}</I18nProvider>;
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
