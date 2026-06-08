import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RpcInfrastructureContext, type RpcInfrastructureContextValue } from "../../../rpcInfrastructure";
import { usePublicNftGate } from "./usePublicNftGate";
import type { FormSchema } from "../../../types";

const mockCheckOwnedNftsForClient = vi.fn();

vi.mock("../../../lib/nftOwnership", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/nftOwnership")>("../../../lib/nftOwnership");
  return {
    ...actual,
    checkOwnedNftsForClient: (...args: unknown[]) => mockCheckOwnedNftsForClient(...args),
  };
});

vi.mock("../../../lib/suiRpcTransport", () => ({
  createBrowserSafeSuiTransport: vi.fn(() => ({ request: vi.fn() })),
}));

vi.mock("@mysten/sui/jsonRpc", () => ({
  SuiJsonRpcClient: vi.fn().mockImplementation(() => ({})),
}));

const rpcContext: RpcInfrastructureContextValue = {
  mode: "default",
  network: "mainnet",
  currentRpcUrl: "https://rpc.example",
  displayRpcUrl: "https://rpc.example",
  defaultRpcUrl: "https://rpc.example",
  tatumRpcUrl: null,
  providerLabel: "RPC",
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

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <RpcInfrastructureContext.Provider value={rpcContext}>
        {children}
      </RpcInfrastructureContext.Provider>
    );
  };
}

function createNftForm(): FormSchema {
  return {
    id: "form-1",
    title: "Prime Holder Signal",
    description: "NFT gated",
    fields: [],
    createdAt: "2026-06-08T00:00:00.000Z",
    accessMode: "nft_required",
    identityPolicy: "wallet_required",
    nftGate: {
      network: "sui-mainnet",
      structType: "0x2::example::Asset",
      requiredCount: 1,
      gateViewing: true,
      gateSubmission: true,
      collectionLabel: "Prime",
      presetId: "custom",
    },
  };
}

function createDiagnostic(overrides: Partial<ReturnType<typeof createEmptyDiagnostic>> = {}) {
  return {
    ...createEmptyDiagnostic(),
    ...overrides,
  };
}

function createEmptyDiagnostic() {
  return {
    connectedAddress: "0xwallet",
    network: "sui-mainnet" as const,
    rpcEndpoint: "https://rpc.example",
    targetTypes: ["0x2::example::Asset"],
    targetObjectIds: [],
    directOwnedCount: 0,
    kioskCount: 0,
    kioskItemCount: 0,
    directOwnedPages: [],
    kioskPages: [],
    directOwnedTypes: [],
    kioskItemTypes: [],
    kioskItemsByKiosk: [],
    requiredTypeBreakdown: [],
    typeComparisons: [],
    matchedDirectObjects: [],
    matchedKioskItems: [],
    sampleObjectTypes: [],
    ownershipChecks: [],
    zeroCountReason: "no_direct_objects_and_no_kiosks_detected",
  };
}

describe("usePublicNftGate", () => {
  beforeEach(() => {
    mockCheckOwnedNftsForClient.mockReset();
  });

  it("does not cache false results across mounts", async () => {
    mockCheckOwnedNftsForClient.mockResolvedValue({
      hasRequiredNft: false,
      matchedCount: 0,
      directOwnedCount: 0,
      kioskCount: 0,
      kioskItemCount: 0,
      matchedDirectObjects: [],
      matchedKioskItems: [],
      diagnostic: createDiagnostic(),
    });

    const form = createNftForm();
    const wrapper = createWrapper();
    const first = renderHook(() => usePublicNftGate(form, "0xwallet"), { wrapper });
    await waitFor(() => expect(first.result.current.hasResolvedOwnership).toBe(true));
    expect(first.result.current.accessStatus).toBe("no_match");
    first.unmount();

    const second = renderHook(() => usePublicNftGate(form, "0xwallet"), { wrapper });
    await waitFor(() => expect(second.result.current.hasResolvedOwnership).toBe(true));
    expect(second.result.current.accessStatus).toBe("no_match");
    expect(mockCheckOwnedNftsForClient).toHaveBeenCalledTimes(2);
  });

  it("treats an unresolved wallet address as wallet_missing rather than no_match", async () => {
    const { result } = renderHook(() => usePublicNftGate(createNftForm(), undefined), {
      wrapper: createWrapper(),
    });

    const accessCheck = await result.current.recheckAccess();
    expect(accessCheck.status).toBe("wallet_missing");
    expect(accessCheck.reason).toBe("wallet_missing");
    expect(accessCheck.passed).toBe(false);
  });
});
