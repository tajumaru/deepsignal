import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "./AppRoot";
import { shouldRequestWalletProvidersOnMountForRoute } from "./walletProviderMountPolicy";

const walletSurfaceRenderSpy = vi.fn();

vi.mock("@mysten/dapp-kit-react", () => ({
  DAppKitProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  createDAppKit: () => ({}),
}));

vi.mock("./lib/mystenDappKitCompat", () => ({
  useCurrentAccount: () => ({
    address: "0xabc0000000000000000000000000000000000000",
  }),
  useCurrentWallet: () => ({
    currentWallet: { name: "Slush" },
    connectionStatus: "connected",
    isConnected: true,
  }),
  useWallets: () => [{ name: "Slush" }],
  useDisconnectWallet: () => ({
    mutateAsync: vi.fn(async () => undefined),
  }),
  useSignPersonalMessage: () => ({
    mutateAsync: vi.fn(async () => ({ signature: "0xmock-signature" })),
  }),
  useSignAndExecuteTransaction: () => ({
    mutateAsync: vi.fn(async () => ({ digest: "0xmock-digest" })),
  }),
  useSuiClientContext: () => ({
    client: null,
    network: "mainnet",
    selectNetwork: vi.fn(),
    networks: {},
  }),
}));

vi.mock("@mysten/suins", () => ({
  SuinsClient: class {
    async getNameRecord() {
      return null;
    }
  },
}));

vi.mock("./hooks/useRpcSuiClient", () => ({
  useRpcSuiClient: () => ({
    core: {
      defaultNameServiceName: async () => ({ data: { name: "tester.sui" } }),
    },
  }),
}));

vi.mock("./components/system/BuildUpdateBanner", () => ({
  BuildUpdateBanner: () => null,
}));

vi.mock("./walrusRuntimeBridge", () => ({
  default: () => null,
}));

vi.mock("./components/PublicAppShell", () => ({
  PublicAppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./components/WalletSurface", async () => {
  const { WalletProviders } = await vi.importActual<typeof import("./providers")>("./providers");
  const { WalletSurfaceContext } = await vi.importActual<typeof import("./components/WalletSurfaceRuntime")>(
    "./components/WalletSurfaceRuntime"
  );
  return {
    WalletSurface: ({ children }: { children: ReactNode }) => {
      walletSurfaceRenderSpy();
      return (
        <div data-testid="wallet-surface">
          <WalletSurfaceContext.Provider
            value={{
              chunkLoaded: true,
              contextAvailable: true,
              failed: false,
              hasCommittedOnce: true,
              loaded: true,
              loading: false,
              markContextAvailable: () => undefined,
              markTreeMounted: () => undefined,
              requestLoad: () => undefined,
              resetReadiness: () => undefined,
              treeMounted: true,
            }}
          >
            <WalletProviders>{children}</WalletProviders>
          </WalletSurfaceContext.Provider>
        </div>
      );
    },
  };
});

vi.mock("./components/AppShell", async () => {
  const { WalletConnectSurface } = await vi.importActual<typeof import("./components/WalletConnectSurface")>(
    "./components/WalletConnectSurface",
  );
  return {
    AppShell: ({
      children,
      walletUiEnabled,
    }: {
      children: ReactNode;
      walletUiEnabled?: boolean;
      chrome: "full" | "public";
    }) => (
      <div>
        {walletUiEnabled ? <WalletConnectSurface compact /> : null}
        {children}
      </div>
    ),
  };
});

vi.mock("./pages/FormBuilderPage", () => ({
  FormBuilderPage: () => <h1>Create Signal Route</h1>,
  default: () => <h1>Create Signal Route</h1>,
}));

vi.mock("./pages/AdminDashboardPage", () => ({
  AdminDashboardPage: () => <h1>Admin Route</h1>,
  default: () => <h1>Admin Route</h1>,
}));

vi.mock("./pages/PublicFormPage", () => ({
  PublicFormPage: () => (
    <div>
      <h1>Public Form Route</h1>
      <p>Wallet-optional public route</p>
    </div>
  ),
  default: () => (
    <div>
      <h1>Public Form Route</h1>
      <p>Wallet-optional public route</p>
    </div>
  ),
}));

function openHashRoute(route: string) {
  window.location.hash = `#${route}`;
}

describe("AppRoot query client regression", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    walletSurfaceRenderSpy.mockClear();
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    consoleError.mockRestore();
    window.history.replaceState(null, "", "/#/");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("does not eager-load wallet providers for wallet-optional public routes", () => {
    expect(shouldRequestWalletProvidersOnMountForRoute("/f/form-123")).toBe(false);
    expect(shouldRequestWalletProvidersOnMountForRoute("/roadmap/form-123")).toBe(false);
    expect(shouldRequestWalletProvidersOnMountForRoute("/m/blob-123")).toBe(false);
  });

  it("keeps wallet provider eager boot for admin and callback routes", () => {
    expect(shouldRequestWalletProvidersOnMountForRoute("/admin")).toBe(true);
    expect(shouldRequestWalletProvidersOnMountForRoute("/dashboard")).toBe(false);
    expect(shouldRequestWalletProvidersOnMountForRoute("/create")).toBe(false);
    expect(shouldRequestWalletProvidersOnMountForRoute("/auth/zklogin/callback")).toBe(false);
  });

  it("renders /create without a missing QueryClient error", async () => {
    openHashRoute("/create");

    render(<AppRoot />);

    await screen.findByRole("heading", { name: "Create Signal Route" });
    expect(walletSurfaceRenderSpy).toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().map(String).join("\n")).not.toContain("No QueryClient set");
  });

  it("renders the public form route without mounting wallet-heavy providers", async () => {
    openHashRoute("/f/form-123?manifest=blob-abc");

    render(<AppRoot />);

    await screen.findByRole("heading", { name: "Public Form Route" });
    expect(screen.getByText("Wallet-optional public route")).toBeInTheDocument();
    expect(walletSurfaceRenderSpy).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().map(String).join("\n")).not.toContain("No QueryClient set");
  });

  it("keeps wallet providers mounted after returning from admin to a public route", async () => {
    openHashRoute("/admin");

    render(<AppRoot />);

    await screen.findByTestId("wallet-surface");

    act(() => {
      openHashRoute("/f/form-123?manifest=blob-abc");
    });

    await screen.findByRole("heading", { name: "Public Form Route" });
    expect(screen.getByTestId("wallet-surface")).toBeInTheDocument();
    expect(consoleError.mock.calls.flat().map(String).join("\n")).not.toContain("No QueryClient set");
  });
});
