import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectWalletButton } from "./ConnectWalletButton";
import type { SuiWalletState } from "../../hooks/useSuiWallet";

vi.mock("./MystenConnectModal", () => ({
  MystenConnectModal: ({
    open,
    onOpenChange,
    trigger,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
  }) => (
    <>
      {trigger}
      {open ? (
        <div role="dialog" aria-label="Choose wallet">
          <button type="button">Slush</button>
          <button type="button">Phantom</button>
          <button type="button" onClick={() => onOpenChange?.(false)}>
            Cancel
          </button>
        </div>
      ) : null}
    </>
  ),
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

  it("closes the controlled modal through onOpenChange when cancelled", async () => {
    const handleOpenChange = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ConnectWalletButton
        wallet={createWalletState()}
        connectModalOpen
        onConnectModalCancel={handleCancel}
        onConnectModalOpenChange={handleOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(handleOpenChange).toHaveBeenCalledWith(false);
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });
  });
});
