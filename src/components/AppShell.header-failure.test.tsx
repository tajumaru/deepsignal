import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("../i18n", () => ({
  useI18n: () => ({
    language: "en",
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("../lib/scheduleIdleTask", () => ({
  scheduleIdleTask: (callback: () => void) => {
    callback();
    return () => undefined;
  },
}));

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

describe("AppShell header wallet failure containment", () => {
  it("contains wallet header failures without bubbling to the route boundary", async () => {
    setWalletUiSmokeRejection(true);
    expect((window as Window & { __DEEPSIGNAL_SMOKE__?: { rejectWalletUiImport?: boolean } }).__DEEPSIGNAL_SMOKE__)
      .toEqual({ rejectWalletUiImport: true });

    expect(() =>
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AppShell
            walletProviderMounted
            walletProviderPending={false}
            walletSessionPhase="disconnected"
            walletUiEnabled
            walletUiRequested
          >
            <h1>Dashboard content survives</h1>
          </AppShell>
        </MemoryRouter>,
      ),
    ).not.toThrow();

    expect(await screen.findByText("Wallet panel could not load")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Dashboard content survives");
    expect(screen.queryByText("DeepSignal route failed to render.")).not.toBeInTheDocument();
  });
});
