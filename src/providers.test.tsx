import { describe, expect, it } from "vitest";
import { deriveWalletConnectionState } from "./walletConnectionState";

describe("deriveWalletConnectionState", () => {
  it("falls back to the wallet account list when the current account hook has not settled yet", () => {
    expect(
      deriveWalletConnectionState({
        accountAddress: null,
        connectionStatus: "connected",
        currentWalletName: "Slush",
        fallbackAccounts: [{ address: "0xabc" }],
        isConnected: true,
      }),
    ).toEqual({
      status: "connected",
      accountAddress: "0xabc",
      walletName: "Slush",
      isRestoringConnection: false,
    });
  });
});
