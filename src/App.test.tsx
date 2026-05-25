import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const walletSurfaceSpy = vi.fn();

vi.mock("./components/AppShell", () => ({
  AppShell: ({
    children,
    walletAvailable,
    chrome,
  }: {
    children: React.ReactNode;
    walletAvailable?: boolean;
    chrome: "full" | "public";
  }) => <div data-testid="app-shell" data-chrome={chrome} data-wallet-available={walletAvailable ? "yes" : "no"}>{children}</div>,
}));

vi.mock("./components/WalletSurface", () => ({
  WalletSurface: ({ children }: { children: React.ReactNode }) => {
    walletSurfaceSpy();
    return <>{children}</>;
  },
}));

vi.mock("./components/WalrusRuntimeSurface", () => ({
  WalrusRuntimeSurface: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./pages/LandingPage", () => ({
  LandingPage: () => <h1>Landing Route</h1>,
}));

vi.mock("./pages/PublicFormPage", () => ({
  PublicFormPage: () => <h1>Public Form Route</h1>,
}));

vi.mock("./pages/ExploreSignalsPage", () => ({
  ExploreSignalsPage: () => <h1>Explore Route</h1>,
}));

vi.mock("./pages/AdminDashboardPage", () => ({
  AdminDashboardPage: () => <h1>Admin Route</h1>,
}));

describe("App routing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    walletSurfaceSpy.mockClear();
  });

  it("redirects /signals to /explore", async () => {
    render(
      <MemoryRouter initialEntries={["/signals"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Explore Route" })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-chrome", "full");
  });

  it("keeps the public form route wallet-optional and on public chrome", async () => {
    render(
      <MemoryRouter initialEntries={["/f/form-123"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Public Form Route" })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-chrome", "public");
  });

  it("renders the admin dashboard route on the full chrome", async () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Admin Route" })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-chrome", "full");
  });

  it("keeps the home route fail-open without waiting for wallet providers", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Landing Route" })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-wallet-available", "no");
    expect(walletSurfaceSpy).not.toHaveBeenCalled();
  });
});
