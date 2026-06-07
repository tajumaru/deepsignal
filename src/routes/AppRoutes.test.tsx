import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./AppRoutes";

const { logRouteLifecycleSpy } = vi.hoisted(() => ({
  logRouteLifecycleSpy: vi.fn(),
}));

const dashboardRestoreSnapshot = {
  routePath: "/dashboard",
  state: "ready_with_project",
  currentProjectId: "0xabc",
  source: "legacy-selected-project",
  walletRuntime: "mounted",
  storageSettled: true,
  walletSettled: true,
  mobileSafari: true,
  errorMessage: null,
};

const walletSessionState = {
  phase: "connected",
  providerMounted: true,
  providerLoading: false,
  status: "connected",
};

vi.mock("../components/DashboardRecoveryPanel", () => ({
  DashboardRecoveryPanel: ({ error }: { error: unknown }) => (
    <div>
      <h1>Dashboard Recovery</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
}));

vi.mock("../components/DashboardShellFirstPanel", () => ({
  DashboardShellFirstPanel: ({ walletStatusMessage }: { walletStatusMessage?: string }) => (
    <div>
      <h1>Dashboard Empty State</h1>
      <p>{walletStatusMessage}</p>
    </div>
  ),
}));

vi.mock("../components/WalletSurface", () => ({
  WalletSurface: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../components/WalletSurfaceRuntime", () => ({
  useWalletProviderRuntime: () => ({
    loaded: false,
    loading: false,
    requestLoad: vi.fn(),
  }),
}));

vi.mock("../components/WalrusRuntimeSurface", () => ({
  WalrusRuntimeSurface: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../lib/routeDiagnostics", async () => {
  const actual = await vi.importActual("../lib/routeDiagnostics");
  return {
    ...actual,
    getBrowserCapabilitiesSnapshot: () => ({ mobileSafari: true }),
    logRouteLifecycle: logRouteLifecycleSpy,
  };
});

vi.mock("../walletSessionState", () => ({
  useWalletSessionState: () => walletSessionState,
}));

vi.mock("../lib/dashboardProjectRestore", async () => {
  const actual = await vi.importActual("../lib/dashboardProjectRestore");
  return {
    ...actual,
    useDashboardProjectRestoreSnapshot: () => dashboardRestoreSnapshot,
  };
});

describe("AppRoutes dashboard isolation", () => {
  afterEach(() => {
    logRouteLifecycleSpy.mockReset();
    Object.assign(dashboardRestoreSnapshot, {
      routePath: "/dashboard",
      state: "ready_with_project",
      currentProjectId: "0xabc",
      source: "legacy-selected-project",
      walletRuntime: "mounted",
      storageSettled: true,
      walletSettled: true,
      mobileSafari: true,
      errorMessage: null,
    });
  });

  it("keeps dashboard route lazy failures out of wallet-import-failed recovery", async () => {
    const routeError = new Error("Route chunk route-admin-dashboard loaded but export AdminDashboardPage was missing.");
    routeError.name = "MissingLazyRouteExportError";
    const components = {
      AccessManagementPage: () => <h1>Access</h1>,
      AdminDashboardPage: () => {
        throw routeError;
      },
      ExploreSignalsPage: () => <h1>Explore</h1>,
      FormBuilderPage: () => <h1>Create</h1>,
      InsightsFixturePage: () => <h1>Fixture</h1>,
      MyResponsesPage: () => <h1>Responses</h1>,
      SubmissionDetailPage: () => <h1>Submission</h1>,
      SubmittedHistoryPage: () => <h1>Submitted</h1>,
      TroubleshootingPage: () => <h1>Troubleshooting</h1>,
    };

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes components={components as never} routeRetryNonce={0} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dashboard Recovery" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard Empty State" })).not.toBeInTheDocument();
    expect(logRouteLifecycleSpy).not.toHaveBeenCalledWith(
      "provider:wallet-import-failed",
      expect.anything(),
    );
  });

  it("renders an empty project shell instead of mounting the dashboard route when no project is selected", async () => {
    Object.assign(dashboardRestoreSnapshot, {
      state: "ready_without_project",
      currentProjectId: "",
      source: "none-confirmed",
    });
    const adminDashboardPageSpy = vi.fn(() => <h1>Admin Route</h1>);
    const components = {
      AccessManagementPage: () => <h1>Access</h1>,
      AdminDashboardPage: adminDashboardPageSpy,
      ExploreSignalsPage: () => <h1>Explore</h1>,
      FormBuilderPage: () => <h1>Create</h1>,
      InsightsFixturePage: () => <h1>Fixture</h1>,
      MyResponsesPage: () => <h1>Responses</h1>,
      SubmissionDetailPage: () => <h1>Submission</h1>,
      SubmittedHistoryPage: () => <h1>Submitted</h1>,
      TroubleshootingPage: () => <h1>Troubleshooting</h1>,
    };

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes components={components as never} routeRetryNonce={0} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dashboard Empty State" })).toBeInTheDocument();
    expect(screen.getByText("Wallet session ready. No signal project is selected yet.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admin Route" })).not.toBeInTheDocument();
    expect(adminDashboardPageSpy).not.toHaveBeenCalled();
  });
});
