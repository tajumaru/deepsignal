let cryptoFactoryPromise: Promise<typeof import("../../../crypto/cryptoFactory")> | null = null;
let storageRuntimePromise: Promise<typeof import("../../../storage/storageRuntime")> | null = null;
let walrusRuntimePromise: Promise<typeof import("../../../storage/walrusRuntime")> | null = null;

function loadCryptoFactory() {
  cryptoFactoryPromise ??= import("../../../crypto/cryptoFactory");
  return cryptoFactoryPromise;
}

function loadStorageRuntime() {
  storageRuntimePromise ??= import("../../../storage/storageRuntime");
  return storageRuntimePromise;
}

function loadWalrusRuntime() {
  walrusRuntimePromise ??= import("../../../storage/walrusRuntime");
  return walrusRuntimePromise;
}

export async function getPublicSealRuntimeStatus() {
  const { getSealRuntimeStatus } = await loadCryptoFactory();
  return getSealRuntimeStatus();
}

export async function getPublicStorageRuntimeStatus() {
  const { getStorageRuntimeStatus } = await loadStorageRuntime();
  return getStorageRuntimeStatus();
}

export async function getLatestWalrusMutationRuntimeStatus() {
  const { getWalrusMutationRuntimeStatus } = await loadWalrusRuntime();
  return getWalrusMutationRuntimeStatus();
}

export async function ensurePublicWalrusMutationRuntime(args: {
  expectedNetwork: string;
  expectedRpcUrl: string;
  requireWallet: boolean;
  timeoutMs: number;
}) {
  const { getWalrusMutationRuntimeStatus, waitForWalrusMutationRuntimeReady } = await loadWalrusRuntime();
  await waitForWalrusMutationRuntimeReady(args);
  return getWalrusMutationRuntimeStatus();
}
