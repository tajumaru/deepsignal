import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectWalletButton } from "./ConnectWalletButton";
import type { SuiWalletState } from "../../hooks/useSuiWallet";

const { connectModalPropsSpy } = vi.hoisted(() => ({
  connectModalPropsSpy: vi.fn(),
}));

vi.mock("@mysten/dapp-kit", () => ({
  ConnectModal: ({
    open,
    onOpenChange,
    trigger,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: React.ReactNode;
  }) => {
    connectModalPropsSpy({ open, onOpenChange });
    return (
      <div>
        {trigger}
        <div data-testid="connect-modal-state">{open ? "open" : "closed"}</div>
      </div>
    );
  },
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
  connectModalPropsSpy.mockClear();
});

describe("ConnectWalletButton", () => {
  it("passes the controlled open state to ConnectModal for disconnected wallets", () => {
    const handleOpenChange = vi.fn();

    render(
      <ConnectWalletButton
        wallet={createWalletState()}
        connectModalOpen
        onConnectModalOpenChange={handleOpenChange}
      />,
    );

    expect(screen.getByTestId("connect-modal-state")).toHaveTextContent("open");
    expect(connectModalPropsSpy).toHaveBeenCalled();
    expect(connectModalPropsSpy.mock.calls[connectModalPropsSpy.mock.calls.length - 1]?.[0]).toEqual(
      expect.objectContaining({
        open: true,
      }),
    );
  });

  it("renders the trigger button without mounting ConnectModal while closed", () => {
    render(<ConnectWalletButton wallet={createWalletState()} connectModalOpen={false} onConnectModalOpenChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
    expect(screen.queryByTestId("connect-modal-state")).not.toBeInTheDocument();
    expect(connectModalPropsSpy).not.toHaveBeenCalled();
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
});
