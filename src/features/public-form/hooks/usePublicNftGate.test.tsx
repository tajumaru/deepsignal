import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RpcInfrastructureContext, type RpcInfrastructureContextValue } from "../../../rpcInfrastructure";
import { clearPublicNftOwnershipCacheForTests, usePublicNftGate } from "./usePublicNftGate";
import type { FormSchema } from "../../../types";
import type { NftOwnershipDiagnostic } from "../../../lib/nftOwnership";

const mockCheckOwnedNftsForClient = vi.fn();

vi.mock("../../../lib/nftOwnership", () => {
  return {
    checkOwnedNftsForClient: (...args: unknown[]) => mockCheckOwnedNftsForClient(...args),
  };
});

vi.mock("../../../lib/suiRpcTransport", () => ({
  createBrowserSafeSuiTransport: vi.fn(() => ({ request: vi.fn() })),
}));

vi.mock("@mysten/sui/jsonRpc", () => ({
  SuiJsonRpcClient: vi.fn().mockImplementation(() => ({
    $extend: vi.fn(),
  })),
}));

vi.mock("@mysten/sui/grpc", () => ({
  SuiGrpcClient: vi.fn().mockImplementation(() => ({
    core: {},
  })),
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

function createDiagnostic(overrides: Partial<NftOwnershipDiagnostic> = {}) {
  return {
    ...createEmptyDiagnostic(),
    ...overrides,
  };
}

function createEmptyDiagnostic(): NftOwnershipDiagnostic {
  return {
    connectedAddress: "0xwallet",
    network: "sui-mainnet" as const,
    rpcEndpoint: "https://rpc.example",
    ownedObjectsOwnerAddress: "0xwallet",
    ownedObjectsFetchCount: 0,
    ownedObjectsShowTypeRequested: true,
    ownedObjectsStructTypeFilterUsed: false,
    ownedObjectsFetchStrategy: "full-scan",
    targetTypes: ["0x2::example::Asset"],
    targetObjectIds: [],
    expectedTypes: ["0x2::example::Asset"],
    expectedObjectIds: [],
    requiredCount: 1,
    matchedCount: 0,
    matchedObjectIds: [],
    matchedSources: [],
    directOwnedCount: 0,
    kioskCount: 0,
    kioskItemCount: 0,
    directOwnedPages: [],
    kioskPages: [],
    directOwnedTypes: [],
    kioskItemTypes: [],
    kioskItemsByKiosk: [],
    requiredTypeBreakdown: [],
    expectedTypeBreakdown: [],
    actualTypeBreakdown: [],
    typeComparisons: [],
    matchedDirectObjects: [],
    matchedKioskItems: [],
    sampleObjectTypes: [],
    directOwnedObjectIdsPreview: [],
    directOwnedObjectTypesPreview: [],
    ownershipChecks: [],
    debugObjectLookups: [],
    configuredStructTypeExactMatches: [],
    zeroCountReason: "no_direct_objects_and_no_kiosks_detected",
    rpcTransportUsed: "json-rpc",
    kioskTransportUsed: "json-rpc-kiosk-extension",
  };
}

describe("usePublicNftGate", () => {
  const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockCheckOwnedNftsForClient.mockReset();
    clearPublicNftOwnershipCacheForTests();
  });

  afterEach(() => {
    consoleInfoSpy.mockClear();
  });

  it("does not cache false results across mounts", async () => {
    mockCheckOwnedNftsForClient.mockResolvedValue({
      hasRequiredNft: false,
      requiredCount: 1,
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

  it("fails clearly on network mismatch without calling RPC", async () => {
    const { result } = renderHook(() => usePublicNftGate({
      ...createNftForm(),
      nftGate: {
        ...createNftForm().nftGate!,
        network: "sui-testnet",
      },
    }, "0xwallet"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.accessStatus).toBe("network_mismatch"));
    expect(result.current.gateError).toContain("different Sui network");
    expect(result.current.debugInfo.zeroCountReason).toBe("network_mismatch");
    expect(mockCheckOwnedNftsForClient).not.toHaveBeenCalled();
  });

  it("reports RPC errors without resolving to no_match", async () => {
    mockCheckOwnedNftsForClient.mockRejectedValue(new Error("rpc down"));

    const { result } = renderHook(() => usePublicNftGate(createNftForm(), "0xwallet"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.accessStatus).toBe("rpc_error"));
    expect(result.current.gateError).toContain("NFT check failed");
    expect(result.current.hasResolvedOwnership).toBe(true);
    expect(result.current.meetsRequirement).toBe(false);

    const accessCheck = await result.current.recheckAccess();
    expect(accessCheck.status).toBe("rpc_error");
    expect(accessCheck.reason).toBe("rpc_error");
    expect(accessCheck.reason).not.toBe("ownership_missing");
  });

  it("exposes the kiosk checking phase while ownership verification is in flight", async () => {
    let resolveOwnership: (value: unknown) => void = () => undefined;
    mockCheckOwnedNftsForClient.mockImplementation((_client, _wallet, _types, _count, _network, _rpc, _ids, onPhaseChange) => {
      onPhaseChange("kiosks");
      return new Promise((resolve) => {
        resolveOwnership = resolve;
      });
    });

    const { result } = renderHook(() => usePublicNftGate(createNftForm(), "0xwallet"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.checkingPhase).toBe("kiosks"));
    await act(async () => {
      resolveOwnership({
        hasRequiredNft: false,
        requiredCount: 1,
        matchedCount: 0,
        directOwnedCount: 0,
        kioskCount: 1,
        kioskItemCount: 1,
        matchedDirectObjects: [],
        matchedKioskItems: [],
        diagnostic: createDiagnostic({
          kioskCount: 1,
          kioskItemCount: 1,
          zeroCountReason: "only_kiosk_items_detected_but_required_type_not_matched",
        }),
      });
    });
  });

  it("forces a fresh RPC recheck on submit-time validation", async () => {
    mockCheckOwnedNftsForClient
      .mockResolvedValueOnce({
        hasRequiredNft: true,
        requiredCount: 1,
        matchedCount: 1,
        directOwnedCount: 1,
        kioskCount: 0,
        kioskItemCount: 0,
        matchedDirectObjects: [{ objectId: "0x1", type: "0x2::example::Asset" }],
        matchedKioskItems: [],
        diagnostic: createDiagnostic({
          matchedCount: 1,
          matchedObjectIds: ["0x1"],
          matchedSources: ["direct"],
          directOwnedCount: 1,
          matchedDirectObjects: [{ objectId: "0x1", type: "0x2::example::Asset" }],
          zeroCountReason: "matched_required_count",
        }),
      })
      .mockResolvedValueOnce({
        hasRequiredNft: true,
        requiredCount: 1,
        matchedCount: 1,
        directOwnedCount: 1,
        kioskCount: 0,
        kioskItemCount: 0,
        matchedDirectObjects: [{ objectId: "0x2", type: "0x2::example::Asset" }],
        matchedKioskItems: [],
        diagnostic: createDiagnostic({
          matchedCount: 1,
          matchedObjectIds: ["0x2"],
          matchedSources: ["direct"],
          directOwnedCount: 1,
          matchedDirectObjects: [{ objectId: "0x2", type: "0x2::example::Asset" }],
          zeroCountReason: "matched_required_count",
        }),
      });

    const { result } = renderHook(() => usePublicNftGate(createNftForm(), "0xwallet"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.accessStatus).toBe("passed"));
    const accessCheck = await result.current.recheckAccess();

    expect(accessCheck.passed).toBe(true);
    expect(accessCheck.ownedCount).toBe(1);
    expect(accessCheck.debug?.matchedObjectIds).toEqual(["0x2"]);
    expect(mockCheckOwnedNftsForClient).toHaveBeenCalledTimes(2);
  });

  it("prefers struct type gates over objectId lookup when both are configured", async () => {
    mockCheckOwnedNftsForClient.mockResolvedValue({
      hasRequiredNft: true,
      requiredCount: 1,
      matchedCount: 1,
      directOwnedCount: 1,
      kioskCount: 0,
      kioskItemCount: 0,
      matchedDirectObjects: [{ objectId: "0x1", type: "0x2::example::Asset" }],
      matchedKioskItems: [],
      diagnostic: createDiagnostic({
        matchedCount: 1,
        matchedObjectIds: ["0x1"],
        matchedSources: ["direct"],
        directOwnedCount: 1,
        matchedDirectObjects: [{ objectId: "0x1", type: "0x2::example::Asset" }],
        zeroCountReason: "matched_required_count",
      }),
    });

    const { result } = renderHook(() => usePublicNftGate({
      ...createNftForm(),
      nftGate: {
        ...createNftForm().nftGate!,
        objectId: "0xdeadbeef",
      },
    }, "0xwallet"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.accessStatus).toBe("passed"));
    expect(mockCheckOwnedNftsForClient).toHaveBeenCalledWith(
      expect.anything(),
      "0xwallet",
      ["0x2::example::Asset"],
      1,
      "sui-mainnet",
      "https://rpc.example",
      [],
      expect.any(Function),
    );
  });

  it("invalidates cached ownership when the wallet disconnects or switches", async () => {
    mockCheckOwnedNftsForClient.mockResolvedValue({
      hasRequiredNft: true,
      requiredCount: 1,
      matchedCount: 1,
      directOwnedCount: 1,
      kioskCount: 0,
      kioskItemCount: 0,
      matchedDirectObjects: [{ objectId: "0x1", type: "0x2::example::Asset" }],
      matchedKioskItems: [],
      diagnostic: createDiagnostic({
        matchedCount: 1,
        matchedObjectIds: ["0x1"],
        matchedSources: ["direct"],
        directOwnedCount: 1,
        matchedDirectObjects: [{ objectId: "0x1", type: "0x2::example::Asset" }],
        zeroCountReason: "matched_required_count",
      }),
    });

    const { result, rerender } = renderHook(
      ({ walletAddress }) => usePublicNftGate(createNftForm(), walletAddress),
      {
        wrapper: createWrapper(),
        initialProps: { walletAddress: "0xwallet" as string | undefined },
      },
    );

    await waitFor(() => expect(result.current.accessStatus).toBe("passed"));
    rerender({ walletAddress: undefined });
    await waitFor(() => expect(result.current.accessStatus).toBe("wallet_missing"));
    expect(result.current.ownedCount).toBe(0);

    rerender({ walletAddress: "0xwallet-2" });
    await waitFor(() => expect(result.current.accessStatus).toBe("passed"));
    expect(mockCheckOwnedNftsForClient).toHaveBeenCalledTimes(2);
  });
});
