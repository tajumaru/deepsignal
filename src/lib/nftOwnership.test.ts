import { describe, expect, it, vi } from "vitest";
import { checkOwnedNftsForClient } from "./nftOwnership";

const PRIME_TYPE =
  "0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachin";

function createEmptyKioskApi() {
  return {
    getOwnedKiosks: vi.fn().mockResolvedValue({ kioskIds: [], hasNextPage: false, nextCursor: null }),
    getKiosk: vi.fn(),
  };
}

function createDirectEntry(objectId: string, type: string) {
  return {
    data: {
      objectId,
      type,
    },
  };
}

describe("checkOwnedNftsForClient", () => {
  it("finds a required NFT on the second getOwnedObjects page", async () => {
    const getOwnedObjects = vi
      .fn()
      .mockResolvedValueOnce({
        data: [createDirectEntry("0x1", "0x2::coin::Coin<0x2::sui::SUI>")],
        hasNextPage: true,
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        data: [createDirectEntry("0x2", PRIME_TYPE)],
        hasNextPage: false,
        nextCursor: null,
      });

    const result = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: createEmptyKioskApi() }) },
      "0xwallet",
      [PRIME_TYPE],
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedDirectObjects).toEqual([{ objectId: "0x0000000000000000000000000000000000000000000000000000000000000002", type: PRIME_TYPE }]);
    expect(result.diagnostic.directOwnedPages).toEqual([
      { cursor: null, hasNextPage: true, nextCursor: "cursor-2", resultCount: 1 },
      { cursor: "cursor-2", hasNextPage: false, nextCursor: null, resultCount: 1 },
    ]);
  });

  it("passes when the NFT is held inside a kiosk", async () => {
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [createDirectEntry("0xdirect-1", "0x2::coin::Coin<0x2::sui::SUI>")],
      hasNextPage: false,
      nextCursor: null,
    });
    const kioskApi = {
      getOwnedKiosks: vi.fn().mockResolvedValue({
        kioskIds: ["0xkiosk-1"],
        hasNextPage: false,
        nextCursor: null,
      }),
      getKiosk: vi.fn().mockResolvedValue({
        items: [
          {
            objectId: "0x111",
            kioskId: "0xkiosk-1",
            type: PRIME_TYPE,
            isLocked: false,
            data: { type: PRIME_TYPE },
          },
        ],
      }),
    };

    const result = await checkOwnedNftsForClient(
      {
        getOwnedObjects,
        $extend: () => ({ kiosk: kioskApi }),
      },
      "0xwallet",
      [PRIME_TYPE],
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedCount).toBe(1);
    expect(result.matchedKioskItems).toEqual([
      {
        objectId: "0x0000000000000000000000000000000000000000000000000000000000000111",
        kioskId: "0xkiosk-1",
        type: PRIME_TYPE,
        isLocked: false,
      },
    ]);
  });

  it("matches a direct object by objectId before type", async () => {
    const targetObjectId = "0xabc";
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [createDirectEntry(targetObjectId, "0x2::example::Other")],
      hasNextPage: false,
      nextCursor: null,
    });

    const result = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: createEmptyKioskApi() }) },
      "0xwallet",
      [PRIME_TYPE],
      "sui-mainnet",
      "https://rpc.example",
      [targetObjectId],
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedDirectObjects[0]).toMatchObject({
      objectId: "0x0000000000000000000000000000000000000000000000000000000000000abc",
      type: "0x2::example::Other",
    });
    expect(result.diagnostic.ownershipChecks.some((entry) =>
      entry.source === "direct" &&
      entry.matchKind === "objectId" &&
      entry.expectedObjectId === "0x0000000000000000000000000000000000000000000000000000000000000abc" &&
      entry.matched
    )).toBe(true);
  });

  it("matches by type when objectId does not match", async () => {
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [createDirectEntry("0x1", PRIME_TYPE)],
      hasNextPage: false,
      nextCursor: null,
    });

    const result = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: createEmptyKioskApi() }) },
      "0xwallet",
      [PRIME_TYPE],
      "sui-mainnet",
      "https://rpc.example",
      ["0x999"],
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedDirectObjects).toHaveLength(1);
    expect(result.diagnostic.ownershipChecks.some((entry) =>
      entry.source === "direct" &&
      entry.matchKind === "structType" &&
      entry.returnedType === PRIME_TYPE &&
      entry.matched
    )).toBe(true);
  });

  it("checks kiosk objectIds after wallet direct checks", async () => {
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [],
      hasNextPage: false,
      nextCursor: null,
    });
    const kioskApi = {
      getOwnedKiosks: vi.fn().mockResolvedValue({
        kioskIds: ["0xkiosk-1"],
        hasNextPage: false,
        nextCursor: null,
      }),
      getKiosk: vi.fn().mockResolvedValue({
        items: [
          {
            objectId: "0x777",
            kioskId: "0xkiosk-1",
            type: "0x2::example::Other",
            isLocked: false,
            data: { type: "0x2::example::Other" },
          },
        ],
      }),
    };

    const result = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: kioskApi }) },
      "0xwallet",
      [],
      "sui-mainnet",
      "https://rpc.example",
      ["0x777"],
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedKioskItems).toEqual([
      {
        objectId: "0x0000000000000000000000000000000000000000000000000000000000000777",
        kioskId: "0xkiosk-1",
        type: "0x2::example::Other",
        isLocked: false,
      },
    ]);
  });

  it("throws on RPC failure instead of treating it as no match", async () => {
    const getOwnedObjects = vi.fn().mockRejectedValue(new Error("rpc down"));

    await expect(
      checkOwnedNftsForClient(
        { getOwnedObjects },
        "0xwallet",
        [PRIME_TYPE],
        "sui-mainnet",
        "https://rpc.example",
      ),
    ).rejects.toThrow("rpc down");
  });
});
