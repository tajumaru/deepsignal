import type { SystemSignalInput } from "./systemSignalReporterRuntime";

let systemSignalReporterRuntimePromise: Promise<typeof import("./systemSignalReporterRuntime")> | null = null;

function loadSystemSignalReporterRuntime() {
  if (!systemSignalReporterRuntimePromise) {
    systemSignalReporterRuntimePromise = import("./systemSignalReporterRuntime");
  }
  return systemSignalReporterRuntimePromise;
}

export function reportSystemError(input: SystemSignalInput) {
  if (typeof window === "undefined") {
    return;
  }
  window.setTimeout(() => {
    void loadSystemSignalReporterRuntime()
      .then(({ persistSystemError }) => persistSystemError(input))
      .catch(() => {
        // System reporting must never make the user experience worse.
      });
  }, 0);
}

export function startSystemSignalReporter() {
  if (typeof window === "undefined") {
    return;
  }
  void loadSystemSignalReporterRuntime()
    .then(({ startSystemSignalReporter: startRuntime }) => {
      startRuntime();
    })
    .catch(() => {
      // Runtime diagnostics are best effort only.
    });
}
