import { retryLazyImport } from "./lazyRetry";
import { getBrowserCapabilitiesSnapshot, getFailedImportsSnapshot, getResourceErrorsSnapshot, logRouteLifecycle } from "./routeDiagnostics";

function hasWalletConnectChunkPath(value: string | null | undefined) {
  return typeof value === "string" && /WalletConnect-[^/]+\.js/i.test(value);
}

export function hadPriorWalletConnectChunkFailure() {
  return (
    getFailedImportsSnapshot().some((entry) => entry.label === "wallet-connect" || hasWalletConnectChunkPath(entry.chunkUrl)) ||
    getResourceErrorsSnapshot().some((entry) => hasWalletConnectChunkPath(entry.src) || hasWalletConnectChunkPath(entry.href))
  );
}

export async function reloadWalletConnectRuntimeForRetry() {
  const mobileSafari = Boolean(getBrowserCapabilitiesSnapshot().mobileSafari);
  logRouteLifecycle("wallet-connect-runtime-reload-start", {
    hadPriorFailure: hadPriorWalletConnectChunkFailure(),
    mobileSafari,
  });
  try {
    await retryLazyImport(() => import("../components/WalletConnect"), "wallet-connect");
    logRouteLifecycle("wallet-connect-runtime-reload-success", {
      mobileSafari,
    });
    return true;
  } catch (error) {
    logRouteLifecycle("wallet-connect-runtime-reload-error", {
      error,
      mobileSafari,
    });
    return false;
  }
}
