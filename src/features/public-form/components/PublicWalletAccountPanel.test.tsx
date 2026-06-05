import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicWalletAccountPanel } from "./PublicWalletAccountPanel";

vi.mock("../../../components/WalletConnectSurface", () => ({
  WalletConnectSurface: () => <div data-testid="wallet-connect-surface" />,
}));

vi.mock("../../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en",
    setLanguage: () => undefined,
  }),
}));

const mockUseSuiWallet = vi.fn();

vi.mock("../../../hooks/useSuiWallet", () => ({
  useSuiWallet: () => mockUseSuiWallet(),
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
