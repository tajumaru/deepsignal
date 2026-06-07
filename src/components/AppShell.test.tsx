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

vi.mock("./WalletRuntimePanel", () => ({
  __esModule: true,
  default: ({ interaction, mode }: { interaction?: string; mode: string }) => (
    <div data-interaction={interaction ?? "default"} data-mode={mode} data-testid="wallet-runtime-panel" />
  ),
}));

vi.mock("../i18n", () => ({
  useI18n: () => ({
    language: "en",
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

function renderShell(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppShell walletUiEnabled={false}>
        <h1>Test workspace</h1>
      </AppShell>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  it("renders a safe wallet placeholder while the wallet provider is still deferred", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell
          walletProviderMounted={false}
          walletProviderPending
          walletSessionPhase="provider_deferred"
          walletUiEnabled={false}
          walletUiRequested
        >
          <h1>Test workspace</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Wallet loading..." })).toBeDisabled();
    expect(screen.getByText("Preparing secure session")).toBeInTheDocument();
  });

  it("keeps the dashboard header wallet panel passive when no project is selected", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell
          walletProviderMounted
          walletProviderPending={false}
          walletSessionPhase="disconnected"
          walletUiEnabled
          walletUiRequested
        >
          <h1>Test workspace</h1>
        </AppShell>
      </MemoryRouter>,
    );

    const panels = await screen.findAllByTestId("wallet-runtime-panel");
    expect(panels.length).toBeGreaterThanOrEqual(2);
    expect(
      panels.some(
        (panel) =>
          panel.getAttribute("data-mode") === "connect" && panel.getAttribute("data-interaction") === "passive",
      ),
    ).toBe(true);
  });

  it("hides mobile compose shortcuts while already on the Create route", () => {
    const { container } = renderShell("/create");

    expect(screen.getAllByRole("heading", { name: "Test workspace" }).length).toBeGreaterThan(0);
    expect(container.querySelector(".mobile-compose-fab")).not.toBeInTheDocument();
    expect(container.querySelector(".mobile-header-cta")).not.toBeInTheDocument();
    expect(container.querySelector(".mobile-inbox-bottom-nav")).toBeInTheDocument();
  });

  it("keeps mobile compose shortcuts available from signal discovery routes", () => {
    const { container } = renderShell("/explore");

    expect(container.querySelector(".mobile-compose-fab")).toBeInTheDocument();
  });

  it("keeps the mobile compose shortcut available from the inbox route", () => {
    const { container } = renderShell("/dashboard");

    expect(container.querySelector(".mobile-compose-fab")).toBeInTheDocument();
  });

  it("shows the mobile bottom navigation from the sent signals route", () => {
    const { container } = renderShell("/my-responses");

    expect(container.querySelector(".mobile-inbox-bottom-nav")).toBeInTheDocument();
    expect(container.querySelector(".mobile-inbox-bottom-nav a.is-active")?.getAttribute("href")).toBe("/my-responses");
  });
});
