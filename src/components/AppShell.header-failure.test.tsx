import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("../lib/dashboardProjectRestore", () => ({
  useDashboardProjectRestoreSnapshot: () => ({
    currentProjectId: "",
    errorMessage: null,
    mobileSafari: false,
    routePath: "/dashboard",
    source: "none-confirmed",
    state: "ready_without_project",
    storageSettled: true,
    walletRuntime: "mounted",
    walletSettled: true,
  }),
}));

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

vi.mock("./WalletRuntimePanel", () => ({
  __esModule: true,
  default: () => {
    throw new Error("wallet panel render failed");
  },
}));

describe("AppShell header wallet failure containment", () => {
  it("contains wallet header failures without bubbling to the route boundary", async () => {
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
