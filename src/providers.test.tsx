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
      connectMode: null,
      connectLockState: "idle",
      lastConnectFailure: null,
    });
  });

  it("treats the session as connected when the wallet exposes an account during a lingering connecting phase", () => {
    expect(
      deriveWalletConnectionState({
        accountAddress: "0xabc",
        connectionStatus: "connecting",
        currentWalletName: "Slush",
        fallbackAccounts: [{ address: "0xabc" }],
        isConnected: true,
      }),
    ).toEqual({
      status: "connected",
      accountAddress: "0xabc",
      walletName: "Slush",
      isRestoringConnection: false,
      connectMode: null,
      connectLockState: "idle",
      lastConnectFailure: null,
    });
  });

  it("treats a manual connect as connecting without classifying it as auto restoration", () => {
    expect(
      deriveWalletConnectionState({
        accountAddress: null,
        connectionStatus: "connecting",
        currentWalletName: "Slush",
        isConnected: false,
        manualConnectActive: true,
      }),
    ).toEqual({
      status: "connecting",
      accountAddress: null,
      walletName: "Slush",
      isRestoringConnection: false,
      connectMode: "manual",
      connectLockState: "manual_connecting",
      lastConnectFailure: null,
    });
  });

  it("suppresses stale auto restore after a failed manual connect reset", () => {
    expect(
      deriveWalletConnectionState({
        accountAddress: null,
        connectionStatus: "connecting",
        currentWalletName: "Slush",
        isConnected: false,
        suppressRestoringConnection: true,
      }),
    ).toEqual({
      status: "disconnected",
      accountAddress: null,
      walletName: "Slush",
      isRestoringConnection: false,
      connectMode: null,
      connectLockState: "idle",
      lastConnectFailure: null,
    });
  });
});
