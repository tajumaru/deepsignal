import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { resetDashboardProjectRestore } from "./lib/dashboardProjectRestore";

const { walrusRuntimeSurfaceSpy, routeFailures } = vi.hoisted(() => ({
  walrusRuntimeSurfaceSpy: vi.fn(),
  routeFailures: {
    explore: null as Error | null,
    admin: null as Error | null,
  },
}));

vi.mock("./components/AppShell", () => ({
  AppShell: ({
    children,
    walletSessionPhase,
    walletUiEnabled,
    chrome,
  }: {
    children: React.ReactNode;
    walletSessionPhase?: string;
    walletUiEnabled?: boolean;
    chrome: "full" | "public";
  }) => (
    <div
      data-testid="app-shell"
      data-chrome={chrome}
      data-wallet-phase={walletSessionPhase ?? "provider_deferred"}
      data-wallet-ui={walletUiEnabled ? "enabled" : "disabled"}
    >
      {children}
    </div>
  ),
}));

vi.mock("./components/PublicAppShell", () => ({
  PublicAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell" data-chrome="public" data-wallet-available="no">{children}</div>
  ),
}));

vi.mock("./components/system/BuildUpdateBanner", () => ({
  BuildUpdateBanner: () => null,
}));

vi.mock("./components/WalrusRuntimeSurface", () => ({
  WalrusRuntimeSurface: ({ children }: { children: React.ReactNode }) => {
    walrusRuntimeSurfaceSpy();
    return <>{children}</>;
  },
}));

vi.mock("./pages/LandingPage", () => ({
  LandingPage: () => (
    <main>
      <h1>CREATE SIGNALS</h1>
      <p>Private by default Permanent by design</p>
      <a href="/#/dashboard">Open Inbox</a>
      <a href="/#/create">Create Signal</a>
    </main>
  ),
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
  AdminDashboardPage: () => {
    if (routeFailures.admin) {
      throw routeFailures.admin;
    }
    return <h1>Admin Route</h1>;
  },
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
    walrusRuntimeSurfaceSpy.mockClear();
    routeFailures.explore = null;
    routeFailures.admin = null;
    resetDashboardProjectRestore();
    window.__DEEPSIGNAL_PERF_MILESTONES__ = [];
    window.__DEEPSIGNAL_PERF__ = {};
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
    expect(walrusRuntimeSurfaceSpy).not.toHaveBeenCalled();
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

  it("keeps the dashboard on the wallet-preparation shell while the provider is still deferred", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Preparing wallet session..." })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-chrome", "full");
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-wallet-ui", "enabled");
  });

  it("does not mark the dashboard interactive while the degraded shell is standing in for workspace boot", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Preparing wallet session..." })).toBeInTheDocument());

    const milestoneNames = (window.__DEEPSIGNAL_PERF_MILESTONES__ ?? []).map((entry) => entry.name);
    expect(milestoneNames).not.toContain("route_ready");
    expect(milestoneNames).not.toContain("route:interactive");
  });

  it("renders the Create Signal route inside the wallet-enabled workspace chrome", async () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Create Signal Route" })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-chrome", "full");
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-wallet-ui", "enabled");
  });

  it("renders the public landing hero immediately without waiting for wallet providers", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "CREATE SIGNALS" })).toBeInTheDocument();
    expect(screen.getByText("Private by default Permanent by design")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Signal" })).toBeInTheDocument();
    expect(screen.queryByText(/Loading encrypted signal workspace/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
  });

  it("keeps My Responses wallet-optional on the full chrome", async () => {
    render(
      <MemoryRouter initialEntries={["/my-responses"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "My Responses Route" })).toBeInTheDocument());
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-chrome", "full");
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-wallet-ui", "disabled");
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

    await screen.findByRole("heading", { name: "App assets out of sync." });
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
      runtimeErrors: [],
      resourceErrors: [],
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

    await screen.findByRole("heading", {
      name: "We couldn't reopen this workspace yet. Your local signals are still preserved.",
    });
    expect(screen.getByText("Technical details").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Technical details"));
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

    await screen.findByRole("heading", { name: "New version available" });
    expect(screen.getByText(/stale-hash/)).toBeInTheDocument();
  });

  it("remounts the failed route on first retry without looping through window reload", async () => {
    routeFailures.explore = new Error("first render failed");

    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", {
      name: "We couldn't reopen this workspace yet. Your local signals are still preserved.",
    });
    const urlBeforeRetry = window.location.href;
    routeFailures.explore = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry route import" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Explore Route" })).toBeInTheDocument());
    expect(window.location.href).toBe(urlBeforeRetry);
  });

  it("keeps admin ReferenceError details folded behind the recovery message", async () => {
    routeFailures.admin = new ReferenceError("demoScenario is not defined");

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", {
      name: "We couldn't reopen this workspace yet. Your local signals are still preserved.",
    });
    expect(screen.queryByText("ReferenceError - demoScenario is not defined")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Refresh app assets",
      "Retry route import",
      "Go to Explore",
      "Clear stale route cache",
      "Copy diagnostics",
    ]);

    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText("ReferenceError")).toBeInTheDocument();
    expect(screen.getByText("demoScenario is not defined")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });
});
