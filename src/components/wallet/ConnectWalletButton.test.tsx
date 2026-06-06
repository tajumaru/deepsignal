import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectWalletButton } from "./ConnectWalletButton";
import type { SuiWalletState } from "../../hooks/useSuiWallet";

vi.mock("@mysten/dapp-kit", () => ({
  ConnectModal: ({
    open,
    onOpenChange,
    trigger,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: React.ReactNode;
  }) => (
    <div data-testid="connect-modal" data-open={open ? "yes" : "no"}>
      <div>{trigger}</div>
      <button type="button" onClick={() => onOpenChange(false)}>
        close modal
      </button>
    </div>
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
    isRestoringConnection: false,
    displayName: "",
    suinsName: null,
    shortAddressLabel: "",
    error: null,
    disconnect: async () => undefined,
    copyAddress: async () => undefined,
    ...overrides,
  };
}

describe("ConnectWalletButton", () => {
  it("controls the wallet modal open state for disconnected wallets", () => {
    const handleOpenChange = vi.fn();

    render(
      <ConnectWalletButton
        wallet={createWalletState()}
        connectModalOpen
        onConnectModalOpenChange={handleOpenChange}
      />,
    );

    expect(screen.getByTestId("connect-modal")).toHaveAttribute("data-open", "yes");
    fireEvent.click(screen.getByText("close modal"));
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});
