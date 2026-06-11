import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckOwnedNftsForClient = vi.fn();
const mockSuiJsonRpcClient = vi.fn();

vi.mock("@mysten/sui/jsonRpc", () => ({
  SuiJsonRpcClient: function MockSuiJsonRpcClient(this: Record<string, unknown>, args: unknown) {
    mockSuiJsonRpcClient(args);
    return this;
  },
}));

vi.mock("./nftOwnership", async () => {
  const actual = await vi.importActual<typeof import("./nftOwnership")>("./nftOwnership");
  return {
    ...actual,
    checkOwnedNftsForClient: (...args: unknown[]) => mockCheckOwnedNftsForClient(...args),
  };
});

describe("runNftOwnershipCheckApi", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCheckOwnedNftsForClient.mockReset();
    mockSuiJsonRpcClient.mockReset();
  });

  it("does not cache false ownership results", async () => {
    mockCheckOwnedNftsForClient
      .mockResolvedValueOnce({
        hasRequiredNft: false,
        requiredCount: 1,
        matchedCount: 0,
        directOwnedCount: 0,
        kioskCount: 0,
        kioskItemCount: 0,
        matchedDirectObjects: [],
        matchedKioskItems: [],
        diagnostic: {
          connectedAddress: "0x0000000000000000000000000000000000000000000000000000000000000001",
          network: "sui-mainnet",
          rpcEndpoint: "https://rpc.example",
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
          ownershipChecks: [],
          zeroCountReason: "no_direct_objects_and_no_kiosks_detected",
          rpcTransportUsed: "json-rpc",
          kioskTransportUsed: "unknown",
        },
      })
      .mockResolvedValueOnce({
        hasRequiredNft: false,
        requiredCount: 1,
        matchedCount: 0,
        directOwnedCount: 0,
        kioskCount: 0,
        kioskItemCount: 0,
        matchedDirectObjects: [],
        matchedKioskItems: [],
        diagnostic: {
          connectedAddress: "0x0000000000000000000000000000000000000000000000000000000000000001",
          network: "sui-mainnet",
          rpcEndpoint: "https://rpc.example",
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
          ownershipChecks: [],
          zeroCountReason: "no_direct_objects_and_no_kiosks_detected",
          rpcTransportUsed: "json-rpc",
          kioskTransportUsed: "unknown",
        },
      });

    const { runNftOwnershipCheckApi } = await import("./nftOwnershipApi");
    const request = {
      address: "0x1",
      network: "sui-mainnet" as const,
      requiredTypes: ["0x2::example::Asset"],
    };

    await runNftOwnershipCheckApi(request, "https://rpc.example");
    await runNftOwnershipCheckApi(request, "https://rpc.example");

    expect(mockCheckOwnedNftsForClient).toHaveBeenCalledTimes(2);
  });

  it("returns rpc_error diagnostics instead of treating a thrown RPC call as no match", async () => {
    mockCheckOwnedNftsForClient.mockRejectedValue(new Error("rpc down"));

    const { runNftOwnershipCheckApi } = await import("./nftOwnershipApi");
    const result = await runNftOwnershipCheckApi(
      {
        address: "0x1",
        network: "sui-mainnet",
        requiredTypes: ["0x2::example::Asset"],
      },
      "https://rpc.example",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("rpc down");
      expect(result.diagnostic?.zeroCountReason).toBe("rpc_error_before_ownership_match");
    }
  });
});
