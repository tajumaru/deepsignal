import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { walletSurfaceSpy, routeFailures } = vi.hoisted(() => ({
  walletSurfaceSpy: vi.fn(),
  routeFailures: {
    explore: null as Error | null,
  },
}));

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
  ExploreSignalsPage: () => {
    if (routeFailures.explore) {
      throw routeFailures.explore;
    }
    return <h1>Explore Route</h1>;
  },
}));

vi.mock("./pages/AdminDashboardPage", () => ({
  AdminDashboardPage: () => <h1>Admin Route</h1>,
}));

vi.mock("./pages/FormBuilderPage", () => ({
  FormBuilderPage: () => <h1>Create Signal Route</h1>,
}));

vi.mock("./pages/MyResponsesPage", () => ({
  MyResponsesPage: () => <h1>My Responses Route</h1>,
}));

describe("App routing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    walletSurfaceSpy.mockClear();
    routeFailures.explore = null;
    window.sessionStorage.clear();
    window.localStorage.clear();
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

  it("renders the Create Signal route inside the wallet-enabled workspace chrome", async () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Create Signal Route" })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-chrome", "full");
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-wallet-available", "yes");
    expect(walletSurfaceSpy).toHaveBeenCalled();
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

  it("keeps My Responses wallet-optional on the full chrome", async () => {
    render(
      <MemoryRouter initialEntries={["/my-responses"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "My Responses Route" })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-chrome", "full");
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-wallet-available", "no");
    expect(walletSurfaceSpy).not.toHaveBeenCalled();
  });

  it("shows app-update diagnostics when a route chunk import fails", async () => {
    routeFailures.explore = new TypeError(
      "Failed to fetch dynamically imported module: https://deepsignal.wal.app/assets/ExploreSignalsPage.js",
    );
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "App update detected, refresh required." });
    expect(screen.getAllByText(/ExploreSignalsPage\.js/).length).toBeGreaterThan(0);
    expect(screen.getByText(/iPhone OS 17_5/)).toBeInTheDocument();
  });

  it("surfaces provider missing errors with provider readiness diagnostics", async () => {
    routeFailures.explore = new Error("useI18n must be used within I18nProvider");
    window.__DEEPSIGNAL_DEBUG__ = {
      providerReadiness: { i18nProvider: "missing", rpcInfrastructureProvider: "ready" },
      routeTimings: [],
      hydrationTimings: [],
      failedImports: [],
      currentProjectId: "",
      cacheRestoreSource: "unknown",
      browserCapabilities: {},
      updatedAt: new Date().toISOString(),
    };

    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Explore hit an unexpected fault." });
    expect(screen.getByText("useI18n must be used within I18nProvider")).toBeInTheDocument();
    expect(screen.getByText(/i18nProvider/)).toBeInTheDocument();
  });

  it("detects stale build asset mismatch before rendering route surfaces", async () => {
    window.sessionStorage.setItem(
      "deepsignal.observedBuildAssets",
      JSON.stringify([
        {
          source: "route-error:explore",
          appVersion: "stale",
          buildTime: "stale-time",
          gitHash: "stale-hash",
          recordedAt: new Date().toISOString(),
        },
      ]),
    );

    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Refreshing DeepSignal assets..." });
    expect(screen.getByText(/stale-hash/)).toBeInTheDocument();
  });

  it("remounts the failed route on first retry without looping through window reload", async () => {
    routeFailures.explore = new Error("first render failed");

    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Explore hit an unexpected fault." });
    const urlBeforeRetry = window.location.href;
    routeFailures.explore = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry surface" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Explore Route" })).toBeInTheDocument());
    expect(window.location.href).toBe(urlBeforeRetry);
  });
});
