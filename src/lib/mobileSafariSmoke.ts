type DeepSignalSmokeFlags = {
  forceLocalStorageOnly?: boolean;
  forceProviderDisconnected?: boolean;
  rejectWalletProviderImport?: boolean;
  rejectWalletUiImport?: boolean;
  slowWalletProviderImportMs?: number;
  slowWalletUiImportMs?: number;
};

function getSmokeWindow() {
  return window as Window & {
    __DEEPSIGNAL_SMOKE__?: DeepSignalSmokeFlags;
  };
}

export function getMobileSafariSmokeFlags(): DeepSignalSmokeFlags {
  if (typeof window === "undefined") {
    return {};
  }
  return getSmokeWindow().__DEEPSIGNAL_SMOKE__ ?? {};
}

export function shouldRejectWalletUiImport(label: string) {
  if (!label.startsWith("wallet-runtime")) {
    return false;
  }
  return Boolean(getMobileSafariSmokeFlags().rejectWalletUiImport);
}
