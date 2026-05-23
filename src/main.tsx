import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { startRuntimeBootstrap } from "./bootstrap/runtime";
import { I18nProvider } from "./i18n";
import { startChunkLoadRecovery } from "./lib/chunkLoadRecovery";
import "./styles/index.css";

function redirectLegacyPublicPathToHashRoute() {
  if (typeof window === "undefined" || window.location.hash) {
    return;
  }
  const { pathname, search } = window.location;
  const legacyRoutePrefixes = ["/f/", "/roadmap/", "/m/"];
  if (!legacyRoutePrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return;
  }
  window.history.replaceState(null, "", `/#${pathname}${search}`);
}

redirectLegacyPublicPathToHashRoute();
startChunkLoadRecovery();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </I18nProvider>
  </React.StrictMode>,
);

startRuntimeBootstrap();
