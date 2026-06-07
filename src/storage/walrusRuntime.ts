import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { WalletAccount, WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import type { WalrusClient } from "@mysten/walrus";
import { WALRUS_AGGREGATOR_URL, WALRUS_UPLOAD_RELAY_URL } from "../lib/sui";
import { getTatumStorageWriteUrl, isTatumStorageEnabled } from "./tatumStorage";

type WalrusEnabledClient = ClientWithCoreApi & { walrus: WalrusClient };
type WalrusStorageMode = "publisher" | "uploadRelay" | "tatum";

export type WalrusRuntimeContext = {
  account: WalletAccount | null;
  wallet: WalletWithRequiredFeatures | null;
  supportedIntents: string[];
  client: WalrusEnabledClient | null;
  rpcUrl: string | null;
  network: string | null;
};

const publisherUrl = import.meta.env.VITE_WALRUS_PUBLISHER_URL?.replace(/\/$/, "");
const aggregatorUrl = WALRUS_AGGREGATOR_URL.replace(/\/$/, "");
const uploadRelayUrl = WALRUS_UPLOAD_RELAY_URL.replace(/\/$/, "");
const walrusStorageMode = (() => {
  const configuredMode = String(import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay").toLowerCase();
  if (configuredMode === "publisher") {
    return "publisher" as const;
  }
  if (configuredMode === "tatum") {
    return "tatum" as const;
  }
  return "uploadRelay" as const;
})() satisfies WalrusStorageMode;

let runtimeContext: WalrusRuntimeContext = {
  account: null,
  wallet: null,
  supportedIntents: [],
  client: null,
  rpcUrl: null,
  network: null,
};
const runtimeListeners = new Set<() => void>();
const WALRUS_RUNTIME_READY_TIMEOUT_MS = 5000;

export function setWalrusRuntimeContext(next: WalrusRuntimeContext) {
  if (
    runtimeContext.account?.address === next.account?.address &&
    runtimeContext.wallet?.name === next.wallet?.name &&
    runtimeContext.client === next.client &&
    runtimeContext.rpcUrl === next.rpcUrl &&
    runtimeContext.network === next.network &&
    runtimeContext.supportedIntents.length === next.supportedIntents.length &&
    runtimeContext.supportedIntents.every((intent, index) => intent === next.supportedIntents[index])
  ) {
    return;
  }
  runtimeContext = next;
  runtimeListeners.forEach((listener) => listener());
}

export function getWalrusRuntimeContext() {
  return runtimeContext;
}

export function subscribeWalrusRuntime(listener: () => void) {
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}

export function getWalrusMutationRuntimeStatus() {
  const tatumWriteConfigured = isTatumStorageEnabled() && Boolean(getTatumStorageWriteUrl());
  return {
    aggregatorConfigured: Boolean(aggregatorUrl),
    writeConfigured:
      walrusStorageMode === "publisher"
        ? Boolean(publisherUrl)
        : walrusStorageMode === "tatum"
          ? tatumWriteConfigured
          : Boolean(uploadRelayUrl),
    hasClient: Boolean(runtimeContext.client),
    hasWallet: Boolean(runtimeContext.account && runtimeContext.wallet),
    rpcUrl: runtimeContext.rpcUrl,
    network: runtimeContext.network,
    canWrite: Boolean(
      aggregatorUrl &&
        (walrusStorageMode === "publisher"
          ? publisherUrl && runtimeContext.client && runtimeContext.account && runtimeContext.wallet
          : walrusStorageMode === "tatum"
            ? tatumWriteConfigured
            : uploadRelayUrl && runtimeContext.client && runtimeContext.account && runtimeContext.wallet),
    ),
    storageMode: walrusStorageMode,
  };
}

function assertUploadRelayEnv() {
  if (!uploadRelayUrl || !aggregatorUrl) {
    throw new Error("Walrus upload relay or aggregator URL is not configured.");
  }
}

function isWalrusMutationRuntimeReady(
  requireWallet: boolean,
  expectedRpcUrl?: string,
  expectedNetwork?: string,
) {
  if (!runtimeContext.client) {
    return false;
  }
  if (requireWallet && (!runtimeContext.account || !runtimeContext.wallet)) {
    return false;
  }
  if (expectedRpcUrl && runtimeContext.rpcUrl !== expectedRpcUrl) {
    return false;
  }
  if (expectedNetwork && runtimeContext.network !== expectedNetwork) {
    return false;
  }
  return true;
}

export async function waitForWalrusMutationRuntimeReady({
  requireWallet = true,
  timeoutMs = WALRUS_RUNTIME_READY_TIMEOUT_MS,
  expectedRpcUrl,
  expectedNetwork,
}: {
  requireWallet?: boolean;
  timeoutMs?: number;
  expectedRpcUrl?: string;
  expectedNetwork?: string;
} = {}) {
  if (walrusStorageMode === "publisher" || walrusStorageMode === "tatum") {
    return;
  }
  assertUploadRelayEnv();
  if (isWalrusMutationRuntimeReady(requireWallet, expectedRpcUrl, expectedNetwork)) {
    return;
  }

  console.info("[walrus runtime] waiting for mutation runtime", {
    requireWallet,
    timeoutMs,
    hasClient: Boolean(runtimeContext.client),
    hasWallet: Boolean(runtimeContext.account && runtimeContext.wallet),
    expectedRpcUrl: expectedRpcUrl ?? null,
    currentRpcUrl: runtimeContext.rpcUrl,
    expectedNetwork: expectedNetwork ?? null,
    currentNetwork: runtimeContext.network,
  });

  await new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("Walrus client is not ready yet. Refresh the page and reconnect your wallet."));
    }, timeoutMs);
    unsubscribe = subscribeWalrusRuntime(() => {
      if (!isWalrusMutationRuntimeReady(requireWallet, expectedRpcUrl, expectedNetwork)) {
        return;
      }
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}
