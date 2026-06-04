import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicWalletAccountPanel } from "./PublicWalletAccountPanel";

const mockUseSuiWallet = vi.hoisted(() => vi.fn());

vi.mock("../../../hooks/useSuiWallet", () => ({
  useSuiWallet: mockUseSuiWallet,
}));

vi.mock("../../../components/WalletConnectSurface", () => ({
  WalletConnectSurface: () => <div>WalletConnectSurface</div>,
}));

describe("PublicWalletAccountPanel", () => {
  it("does not clear the account address during wallet updates", () => {
    const onAccountAddressChange = vi.fn();
    const onWalletProviderChange = vi.fn();

    mockUseSuiWallet.mockReturnValue({
      accountAddress: undefined,
      walletName: undefined,
    });

    const view = render(
      <PublicWalletAccountPanel
        onAccountAddressChange={onAccountAddressChange}
        onWalletProviderChange={onWalletProviderChange}
      />,
    );

    mockUseSuiWallet.mockReturnValue({
      accountAddress: "0xabc",
      walletName: "Slush",
    });

    view.rerender(
      <PublicWalletAccountPanel
        onAccountAddressChange={onAccountAddressChange}
        onWalletProviderChange={onWalletProviderChange}
      />,
    );

    expect(onAccountAddressChange.mock.calls).toEqual([[undefined], ["0xabc"]]);
    expect(onWalletProviderChange.mock.calls).toEqual([[undefined], ["Slush"]]);
  });
});
