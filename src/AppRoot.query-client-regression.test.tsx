import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "./AppRoot";

vi.mock("@mysten/dapp-kit", () => ({
  createNetworkConfig: (config: unknown) => ({ networkConfig: config }),
  SuiClientProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  WalletProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useCurrentAccount: () => ({
    address: "0xabc0000000000000000000000000000000000000",
  }),
  useCurrentWallet: () => ({
    currentWallet: { name: "Slush" },
    connectionStatus: "connected",
    isConnected: true,
  }),
  useDisconnectWallet: () => ({
    mutateAsync: vi.fn(async () => undefined),
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
  return {
    WalletSurface: ({ children }: { children: ReactNode }) => <WalletProviders>{children}</WalletProviders>,
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

vi.mock("./pages/PublicFormPage", async () => {
  const { PublicWalletAccountPanel } = await vi.importActual<
    typeof import("./features/public-form/components/PublicWalletAccountPanel")
  >("./features/public-form/components/PublicWalletAccountPanel");
  const { WalletActionContext, WalletConnectionContext } = await vi.importActual<
    typeof import("./walletStatus")
  >("./walletStatus");
  return {
    PublicFormPage: () => (
      <div>
        <h1>Public Form Route</h1>
        <WalletConnectionContext.Provider
          value={{
            status: "connected",
            accountAddress: "0xabc0000000000000000000000000000000000000",
            walletName: "Slush",
            isRestoringConnection: false,
          }}
        >
          <WalletActionContext.Provider
            value={{
              disconnect: async () => undefined,
              signAndExecuteTransaction: vi.fn(async () => ({ digest: "0xmock-digest" })),
            }}
          >
            <PublicWalletAccountPanel
              onAccountAddressChange={() => undefined}
              onWalletProviderChange={() => undefined}
            />
          </WalletActionContext.Provider>
        </WalletConnectionContext.Provider>
      </div>
    ),
    default: () => (
      <div>
        <h1>Public Form Route</h1>
        <WalletConnectionContext.Provider
          value={{
            status: "connected",
            accountAddress: "0xabc0000000000000000000000000000000000000",
            walletName: "Slush",
            isRestoringConnection: false,
          }}
        >
          <WalletActionContext.Provider
            value={{
              disconnect: async () => undefined,
              signAndExecuteTransaction: vi.fn(async () => ({ digest: "0xmock-digest" })),
            }}
          >
            <PublicWalletAccountPanel
              onAccountAddressChange={() => undefined}
              onWalletProviderChange={() => undefined}
            />
          </WalletActionContext.Provider>
        </WalletConnectionContext.Provider>
      </div>
    ),
  };
});

function openHashRoute(route: string) {
  window.history.pushState(null, "", `/#${route}`);
}

describe("AppRoot query client regression", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it("renders /create wallet UI without a missing QueryClient error", async () => {
    openHashRoute("/create");

    render(<AppRoot />);

    await waitFor(() => expect(screen.getByText("Secure Session Active · Slush")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button")).toBeInTheDocument());
    expect(consoleError.mock.calls.flat().map(String).join("\n")).not.toContain("No QueryClient set");
  });

  it("renders the public form wallet account panel without a missing QueryClient error", async () => {
    openHashRoute("/f/form-123?manifest=blob-abc");

    render(<AppRoot />);

    await screen.findByRole("heading", { name: "Public Form Route" });
    await waitFor(() => expect(screen.getByRole("button")).toBeInTheDocument());
    expect(consoleError.mock.calls.flat().map(String).join("\n")).not.toContain("No QueryClient set");
  });
});
