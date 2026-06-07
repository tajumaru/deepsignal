import { describe, expect, it } from "vitest";
import { selectCanonicalWalletSessionState } from "./walletCanonicalState";

describe("selectCanonicalWalletSessionState", () => {
  it("keeps a loaded wallet without an account disconnected even if the provider reports connecting", () => {
    expect(
      selectCanonicalWalletSessionState({
        accountAddress: null,
        connectLockState: "auto_restoring",
        connectMode: "autoRestore",
        connectionStatus: "connecting",
        isRestoringConnection: true,
        providerLoading: false,
        providerMounted: true,
        walletName: "Slush",
      }),
    ).toEqual({
      accountAddress: null,
      canonicalStatus: "disconnected",
      connectLockState: "auto_restoring",
      connectMode: "autoRestore",
      connectionStatus: "connecting",
      isRestoringConnection: true,
      providerLoading: false,
      providerMounted: true,
      walletName: "Slush",
    });
  });

  it("treats a loaded wallet with an account as connected", () => {
    expect(
      selectCanonicalWalletSessionState({
        accountAddress: "0xabc",
        connectLockState: "auto_restoring",
        connectMode: "autoRestore",
        connectionStatus: "connecting",
        isRestoringConnection: true,
        providerLoading: false,
        providerMounted: true,
        walletName: "Slush",
      }),
    ).toEqual({
      accountAddress: "0xabc",
      canonicalStatus: "connected",
      connectLockState: "auto_restoring",
      connectMode: "autoRestore",
      connectionStatus: "connecting",
      isRestoringConnection: true,
      providerLoading: false,
      providerMounted: true,
      walletName: "Slush",
    });
  });
});
