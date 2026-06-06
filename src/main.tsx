import React from "react";
import ReactDOM from "react-dom/client";
import { AppRoot } from "./AppRoot";
import { startBuildAssetDiagnostics } from "./lib/buildAssetDiagnostics";
import { startChunkLoadRecovery } from "./lib/chunkLoadRecovery";
import { startFirstPaintInstrumentation, startPerf } from "./lib/perf";
import { startSystemSignalReporter } from "./services/systemSignalReporterClient";
import "./styles/index.css";

startPerf("app_boot_start");

function redirectLegacyPublicPathToHashRoute() {
  if (typeof window === "undefined" || window.location.hash) {
    return;
  }
  const { pathname, search } = window.location;
  const legacyRoutePrefixes = ["/f/", "/roadmap/", "/m/", "/auth/zklogin/"];
  if (!legacyRoutePrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return;
  }
  window.history.replaceState(null, "", `/#${pathname}${search}`);
}

redirectLegacyPublicPathToHashRoute();
startBuildAssetDiagnostics();
startChunkLoadRecovery();
startSystemSignalReporter();
startPerf("app:render");
startFirstPaintInstrumentation();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);

window.setTimeout(() => {
  void import("./bootstrap/runtime")
    .then(({ startRuntimeBootstrap }) => {
      startRuntimeBootstrap();
    })
    .catch(() => {
      // Idle maintenance is best effort and should not block app startup.
    });
}, 0);
