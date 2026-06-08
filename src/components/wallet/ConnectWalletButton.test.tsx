import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectWalletButton } from "./ConnectWalletButton";
import type { SuiWalletState } from "../../hooks/useSuiWallet";

const {
  connectWalletMutateAsyncSpy,
  logRouteLifecycleSpy,
} = vi.hoisted(() => ({
  connectWalletMutateAsyncSpy: vi.fn(async () => ({ accounts: [{ address: "0xabc", chains: ["sui:mainnet"] }] })),
  logRouteLifecycleSpy: vi.fn(),
}));

vi.mock("@mysten/dapp-kit", () => ({
  useConnectWallet: () => ({
    isPending: false,
    mutateAsync: connectWalletMutateAsyncSpy,
  }),
  useWallets: () => [
    {
      name: "Slush",
    },
    {
      name: "Phantom",
    },
  ],
}));

vi.mock("../../lib/routeDiagnostics", () => ({
  logRouteLifecycle: logRouteLifecycleSpy,
}));

function createWalletState(overrides: Partial<SuiWalletState> = {}): SuiWalletState {
  return {
    account: null,
    accountAddress: undefined,
    walletName: undefined,
    status: "disconnected",
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    isProviderPending: false,
    isRestoringConnection: false,
    connectLockState: "idle",
    connectMode: null,
    lastConnectFailure: null,
    displayName: "",
    suinsName: null,
    shortAddressLabel: "",
    error: null,
    disconnect: async () => undefined,
    copyAddress: async () => undefined,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  connectWalletMutateAsyncSpy.mockClear();
  logRouteLifecycleSpy.mockClear();
});

describe("ConnectWalletButton", () => {
  it("renders the controlled chooser when open for disconnected wallets", () => {
    const handleCancel = vi.fn();

    render(
      <ConnectWalletButton
        wallet={createWalletState()}
        connectModalOpen
        onConnectModalCancel={handleCancel}
        onConnectModalOpenChange={() => undefined}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Choose wallet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slush" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phantom" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("renders the trigger button without mounting the chooser while closed", () => {
    render(<ConnectWalletButton wallet={createWalletState()} connectModalOpen={false} onConnectModalOpenChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Choose wallet" })).not.toBeInTheDocument();
  });

  it("runs manual connect preflight before opening the controlled modal", () => {
    const handleManualConnectRequest = vi.fn();

    render(
      <ConnectWalletButton
        wallet={createWalletState()}
        connectModalOpen={false}
        onConnectModalOpenChange={() => undefined}
        onManualConnectRequest={handleManualConnectRequest}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    expect(handleManualConnectRequest).toHaveBeenCalledTimes(1);
  });

  it("logs and executes the adapter connect flow for the selected wallet", async () => {
    const handleConnectAttemptSuccess = vi.fn();

    render(
      <ConnectWalletButton
        wallet={createWalletState()}
        connectModalOpen
        onConnectAttemptSuccess={handleConnectAttemptSuccess}
        onConnectModalOpenChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Slush" }));

    expect(connectWalletMutateAsyncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet: expect.objectContaining({
          name: "Slush",
        }),
      }),
    );
    expect(logRouteLifecycleSpy).toHaveBeenCalledWith("wallet-connect-adapter-call", expect.anything());
    expect(logRouteLifecycleSpy).toHaveBeenCalledWith("wallet-connect-slush-modal-open", expect.anything());
    await waitFor(() => {
      expect(logRouteLifecycleSpy).toHaveBeenCalledWith("wallet-connect-adapter-resolved", expect.anything());
      expect(logRouteLifecycleSpy).toHaveBeenCalledWith("wallet-connect-final-state", expect.anything());
      expect(handleConnectAttemptSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
