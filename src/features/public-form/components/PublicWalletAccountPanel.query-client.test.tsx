import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { RpcInfrastructureContext, type RpcInfrastructureContextValue } from "../../../rpcInfrastructure";
import { WalletActionContext, WalletConnectionContext } from "../../../walletStatus";
import { PublicWalletAccountPanel } from "./PublicWalletAccountPanel";

vi.mock("../../../hooks/useRpcSuiClient", () => ({
  useRpcSuiClient: () => ({
    core: {
      defaultNameServiceName: async () => ({ data: { name: "tester.sui" } }),
    },
  }),
}));
vi.mock("@mysten/suins", () => ({
  SuinsClient: class {
    constructor() {}
    async getNameRecord() {
      return null;
    }
  },
}));
vi.mock("../../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en",
    setLanguage: () => undefined,
  }),
}));

describe("PublicWalletAccountPanel query client regression", () => {
  const rpcInfrastructure: RpcInfrastructureContextValue = {
    mode: "default",
    network: "mainnet",
    currentRpcUrl: "https://fullnode.mainnet.sui.io",
    displayRpcUrl: "https://fullnode.mainnet.sui.io",
    defaultRpcUrl: "https://fullnode.mainnet.sui.io",
    tatumRpcUrl: null,
    providerLabel: "Sui Fullnode",
    usingTatum: false,
    canUseTatum: false,
    connectedNetworkLabel: "mainnet",
    setConnectedNetworkLabel: vi.fn(),
    switchToDefault: vi.fn(),
    switchToTatum: vi.fn(),
    noteRateLimited: vi.fn(),
    clearRateLimitedState: vi.fn(),
    rateLimitedUntil: 0,
    isRateLimitedCooldownActive: false,
    canAutoFallbackFromRateLimit: true,
  };

  it("renders public form wallet panel on a route with QueryClientProvider", async () => {
    const queryClient = new QueryClient();
    const onAccountAddressChange = vi.fn();
    const onWalletProviderChange = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <RpcInfrastructureContext.Provider value={rpcInfrastructure}>
          <WalletConnectionContext.Provider
            value={{
              status: "connected",
              accountAddress: "0xabc0000000000000000000000000000000000000",
              walletName: "Slush",
              isRestoringConnection: false,
              connectMode: null,
              connectLockState: "idle",
              lastConnectFailure: null,
            }}
          >
            <WalletActionContext.Provider
              value={{
                disconnect: async () => undefined,
                signAndExecuteTransaction: vi.fn(async () => ({ digest: "0xmock-digest" })),
                signPersonalMessage: vi.fn(async () => "0xmock-signature"),
              }}
            >
              <PublicWalletAccountPanel
                onAccountAddressChange={onAccountAddressChange}
                onWalletProviderChange={onWalletProviderChange}
              />
            </WalletActionContext.Provider>
          </WalletConnectionContext.Provider>
        </RpcInfrastructureContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(onAccountAddressChange).toHaveBeenCalledWith("0xabc0000000000000000000000000000000000000");
      expect(onWalletProviderChange).toHaveBeenCalledWith("Slush");
    });
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
