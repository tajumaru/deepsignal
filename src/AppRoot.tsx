import { useEffect, type ReactNode } from "react";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import { setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    setDeepSignalDebugReadiness({ i18nProvider: "ready" });
  }, []);

  return <I18nProvider>{children}</I18nProvider>;
}

export function AppRoot() {
  return (
    <AppProviders>
      <HashRouter>
        <App />
      </HashRouter>
    </AppProviders>
  );
}
