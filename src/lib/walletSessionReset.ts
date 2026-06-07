const DAPP_KIT_WALLET_STORAGE_KEY = "sui-dapp-kit:wallet-connection-info";
const DEEPSIGNAL_WALLET_STORAGE_PREFIXES = ["deepsignal:wallet", "deepsignal.wallet"];
const DEEPSIGNAL_WALLET_STORAGE_KEYS = [
  "deepsignal:selected-wallet",
  "deepsignal:wallet-session",
  "deepsignal:wallet-reset",
];
const WALLET_RESET_RELOAD_SESSION_KEY = "deepsignal:wallet-session-reset-reload";

function getLocalStorageKeys() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return Array.from({ length: window.localStorage.length }, (_value, index) => window.localStorage.key(index)).filter(
      (key): key is string => Boolean(key),
    );
  } catch {
    return [];
  }
}

function isDeepSignalWalletStorageKey(key: string) {
  if (key === DAPP_KIT_WALLET_STORAGE_KEY) {
    return true;
  }

  if (DEEPSIGNAL_WALLET_STORAGE_KEYS.includes(key)) {
    return true;
  }

  return DEEPSIGNAL_WALLET_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function clearWalletSessionStorage() {
  if (typeof window === "undefined") {
    return { removedKeys: [] as string[] };
  }

  const removedKeys: string[] = [];

  try {
    getLocalStorageKeys().forEach((key) => {
      if (!isDeepSignalWalletStorageKey(key)) {
        return;
      }
      window.localStorage.removeItem(key);
      removedKeys.push(key);
    });
  } catch (error) {
    console.warn("[DeepSignal wallet] Failed to clear wallet session storage.", error);
  }

  return { removedKeys };
}

export async function resetWalletSession(options?: {
  disconnectWallet?: () => Promise<void>;
  onBeforeReload?: () => void;
}) {
  let disconnectError: Error | null = null;

  if (options?.disconnectWallet) {
    try {
      await options.disconnectWallet();
    } catch (error) {
      disconnectError = error instanceof Error ? error : new Error(String(error));
      console.warn("[DeepSignal wallet] Wallet disconnect failed during reset.", error);
    }
  }

  const storage = clearWalletSessionStorage();

  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(WALLET_RESET_RELOAD_SESSION_KEY);
    }
  } catch {
    // Ignore sessionStorage cleanup failures so reset still proceeds.
  }

  options?.onBeforeReload?.();

  return {
    disconnectError,
    removedKeys: storage.removedKeys,
  };
}

export function reloadPageOnceForWalletReset() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (window.sessionStorage.getItem(WALLET_RESET_RELOAD_SESSION_KEY) === "1") {
      return false;
    }

    window.sessionStorage.setItem(WALLET_RESET_RELOAD_SESSION_KEY, "1");
  } catch {
    // Ignore guard persistence failures and still attempt the reload.
  }

  window.location.reload();
  return true;
}

