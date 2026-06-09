const lazyImportCompatibilityRecoveryKey = "deepsignal.lazyImportCompatibilityRecovery";
const compatibilitySessionStorageKeys = [
  "deepsignal.chunkLoadRecovery",
  lazyImportCompatibilityRecoveryKey,
] as const;

export function markLazyImportCompatibilityFallback(details: {
  failureKind: "css_preload" | "modulepreload";
  label: string;
  routePath: string;
}) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      lazyImportCompatibilityRecoveryKey,
      JSON.stringify({
        ...details,
        recordedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Best effort only.
  }
}

export function clearLazyImportCompatibilityState() {
  if (typeof window === "undefined") {
    return;
  }
  for (const key of compatibilitySessionStorageKeys) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Best effort only.
    }
  }
}

export function retryLazyImportCompatibilityReload() {
  if (typeof window === "undefined") {
    return;
  }
  clearLazyImportCompatibilityState();
  window.location.reload();
}
