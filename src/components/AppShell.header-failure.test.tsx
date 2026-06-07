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
    );

    expect(await screen.findByText("Wallet panel could not load")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard content survives" })).toBeInTheDocument();
    expect(screen.queryByText("DeepSignal route failed to render.")).not.toBeInTheDocument();
  });
});
