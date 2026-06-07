import { afterEach, describe, expect, it } from "vitest";
import { shouldRejectWalletUiImport } from "./mobileSafariSmoke";

function setWalletUiSmokeRejection(enabled: boolean) {
  const windowWithSmoke = window as Window & {
    __DEEPSIGNAL_SMOKE__?: {
      rejectWalletUiImport?: boolean;
    };
  };

  if (enabled) {
    windowWithSmoke.__DEEPSIGNAL_SMOKE__ = {
      rejectWalletUiImport: true,
    };
    return;
  }

  delete windowWithSmoke.__DEEPSIGNAL_SMOKE__;
}

afterEach(() => {
  setWalletUiSmokeRejection(false);
});

describe("mobileSafariSmoke", () => {
  it("rejects wallet-runtime labels only when the wallet UI smoke flag is enabled", () => {
    setWalletUiSmokeRejection(true);

    expect(shouldRejectWalletUiImport("wallet-runtime-panel")).toBe(true);
    expect(shouldRejectWalletUiImport("wallet-runtime-connect-surface")).toBe(true);
  });

  it("does not reject non-wallet labels when only the wallet UI smoke flag is enabled", () => {
    setWalletUiSmokeRejection(true);

    expect(shouldRejectWalletUiImport("network-menu")).toBe(false);
    expect(shouldRejectWalletUiImport("public-form-route")).toBe(false);
  });

  it("returns false when no smoke flag is enabled", () => {
    expect(shouldRejectWalletUiImport("wallet-runtime-panel")).toBe(false);
    expect(shouldRejectWalletUiImport("wallet-runtime-connect-surface")).toBe(false);
    expect(shouldRejectWalletUiImport("network-menu")).toBe(false);
  });
});
