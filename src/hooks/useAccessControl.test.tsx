import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAccessControl } from "./useAccessControl";

vi.mock("../lib/sui", () => ({
  ACCESS_CONTROL_PACKAGE_ID: "0xpackage",
  ACCESS_CONTROL_REGISTRY_ID: "0xregistry",
  ACCESS_CONTROL_OWNER_CAP_TYPE: "0xpackage::access_control::OwnerCap",
  ACCESS_CONTROL_ADMIN_CAP_TYPE: "0xpackage::access_control::AdminCap",
  ACCESS_CONTROL_REVIEWER_CAP_TYPE: "0xpackage::access_control::ReviewerCap",
}));

vi.mock("../rpcInfrastructure", () => ({
  useRpcInfrastructure: () => ({
    mode: "tatum",
    network: "mainnet",
    currentRpcUrl: "https://sui-mainnet.gateway.tatum.io",
    displayRpcUrl: "https://sui-mainnet.gateway.tatum.io",
    defaultRpcUrl: "https://fullnode.mainnet.sui.io:443",
    tatumRpcUrl: "https://sui-mainnet.gateway.tatum.io",
    providerLabel: "Tatum RPC",
    usingTatum: true,
    canUseTatum: true,
    connectedNetworkLabel: "mainnet",
    setConnectedNetworkLabel: vi.fn(),
    switchToDefault: vi.fn(),
    switchToTatum: vi.fn(),
    noteRateLimited: vi.fn(),
    clearRateLimitedState: vi.fn(),
    rateLimitedUntil: Date.now() + 15_000,
    isRateLimitedCooldownActive: true,
    canAutoFallbackFromRateLimit: false,
  }),
}));

vi.mock("./useAccessRegistry", () => ({
  useAccessRegistry: vi.fn(() => ({
    registry: {
      owner: {
        address: "0xowner",
        capId: "0xowner-cap",
        role: "owner",
        status: "active",
      },
      admins: [],
      reviewers: [],
    },
    isLoadingRegistry: false,
    error: null,
  })),
}));

vi.mock("./useOwnedSuiObjects", () => ({
  useOwnedSuiObjects: vi.fn(() => ({
    data: [
      {
        data: {
          objectId: "0xowner-cap",
          type: "0xpackage::access_control::OwnerCap",
          content: {
            dataType: "moveObject",
            fields: {
              registry_id: "0xregistry",
            },
          },
        },
      },
    ],
    error: null,
    isError: false,
    isPending: false,
  })),
}));

describe("useAccessControl", () => {
  it("preserves capability reads during RPC cooldown windows", () => {
    const { result } = renderHook(() => useAccessControl("0xowner"));

    expect(result.current.capabilityProfile.hasOwnerCap).toBe(true);
    expect(result.current.capabilityProfile.ownerCapIds).toEqual(["0xowner-cap"]);
    expect(result.current.isLoadingAccess).toBe(false);
  });
});
