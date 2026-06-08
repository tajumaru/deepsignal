import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletRequiredGate } from "./WalletRequiredGate";
import type { WalletSessionState } from "../walletSessionState";

const { walletConnectSurfaceSpy } = vi.hoisted(() => ({
  walletConnectSurfaceSpy: vi.fn(() => <div>Wallet connect surface</div>),
}));

vi.mock("../components/WalletConnectSurface", () => ({
  WalletConnectSurface: walletConnectSurfaceSpy,
}));

afterEach(() => {
  cleanup();
});

function createWalletSessionState(overrides: Partial<WalletSessionState> = {}): WalletSessionState {
  return {
    accountAddress: null,
    canonicalStatus: "booting",
    isRestoringConnection: false,
    phase: "provider_deferred",
    providerLoading: false,
    providerMounted: false,
    status: "disconnected",
    walletName: null,
    ...overrides,
  };
}

describe("WalletRequiredGate", () => {
  it("renders a stable loading shell while the wallet provider is pending", () => {
    render(
      <WalletRequiredGate
        walletRequired
        walletSession={createWalletSessionState({
          phase: "provider_deferred",
          providerLoading: true,
          providerMounted: false,
        })}
      >
        <div>Secure route</div>
      </WalletRequiredGate>,
    );

    expect(screen.getByRole("heading", { name: "Loading wallet provider..." })).toBeInTheDocument();
    expect(screen.queryByText("Secure route")).not.toBeInTheDocument();
  });

  it("renders only the connect-required gate when the provider is ready but disconnected", () => {
    render(
      <WalletRequiredGate
        walletRequired
        walletSession={createWalletSessionState({
          phase: "disconnected",
          providerLoading: false,
          providerMounted: true,
        })}
      >
        <div>Secure route</div>
      </WalletRequiredGate>,
    );

    expect(screen.getByRole("heading", { name: "Connect Wallet Required" })).toBeInTheDocument();
    expect(screen.getByText("Wallet connect surface")).toBeInTheDocument();
    expect(screen.queryByText("Secure route")).not.toBeInTheDocument();
  });

  it("passes the admin gate context through to the wallet connect surface", () => {
    render(
      <WalletRequiredGate
        walletRequired
        walletSession={createWalletSessionState({
          phase: "disconnected",
          providerLoading: false,
          providerMounted: true,
        })}
      >
        <div>Secure route</div>
      </WalletRequiredGate>,
    );

    expect(walletConnectSurfaceSpy).toHaveBeenCalled();
    const firstCallProps = ((walletConnectSurfaceSpy.mock.calls as unknown as Array<[unknown]>)[0])?.[0];
    expect(firstCallProps).toEqual(
      expect.objectContaining({
        compact: true,
        context: "adminGate",
      }),
    );
  });

  it("renders the route content once the wallet is connected", () => {
    render(
      <WalletRequiredGate
        walletRequired
        walletSession={createWalletSessionState({
          accountAddress: "0xabc",
          canonicalStatus: "connected",
          phase: "connected",
          providerLoading: false,
          providerMounted: true,
          status: "connected",
        })}
      >
        <div>Secure route</div>
      </WalletRequiredGate>,
    );

    expect(screen.getByText("Secure route")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect Wallet Required" })).not.toBeInTheDocument();
  });
});
