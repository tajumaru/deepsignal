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
      1,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedDirectObjects).toEqual([{ objectId: "0x0000000000000000000000000000000000000000000000000000000000000002", type: PRIME_TYPE }]);
    expect(getOwnedObjects).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        filter: {
          StructType: PRIME_TYPE,
        },
      }),
    );
    expect(result.diagnostic.directOwnedPages).toEqual([]);
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
      1,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.hasAccess).toBe(true);
    expect(result.matchedBy).toBe("kiosk-item");
    expect(result.matchedObjectId).toBe("0x0000000000000000000000000000000000000000000000000000000000000111");
    expect(result.matchedType).toBe(PRIME_TYPE);
    expect(result.checkedOwnedObjects).toBe(1);
    expect(result.checkedKiosks).toBe(1);
    expect(result.checkedKioskItems).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.matchedCount).toBe(1);
    expect(result.matchedKioskItems).toEqual([
      {
        objectId: "0x0000000000000000000000000000000000000000000000000000000000000111",
        kioskId: "0xkiosk-1",
        type: PRIME_TYPE,
        isLocked: false,
        isListed: false,
        state: ["placed"],
      },
    ]);
  });

  it("rejects when no address-owned or kiosk NFT matches", async () => {
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [createDirectEntry("0x1", "0x2::example::Other")],
      hasNextPage: false,
      nextCursor: null,
    });

    const result = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: createEmptyKioskApi() }) },
      "0xwallet",
      [PRIME_TYPE],
      1,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(false);
    expect(result.hasAccess).toBe(false);
    expect(result.matchedBy).toBeNull();
    expect(result.checkedOwnedObjects).toBe(1);
    expect(result.checkedKiosks).toBe(0);
    expect(result.checkedKioskItems).toBe(0);
  });

  it("matches package IDs across zero-padding differences", async () => {
    const shortenedPrimeType =
      "0x34c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachin";
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [createDirectEntry("0x2", PRIME_TYPE)],
      hasNextPage: false,
      nextCursor: null,
    });

    const result = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: createEmptyKioskApi() }) },
      "0xwallet",
      [shortenedPrimeType],
      1,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedBy).toBe("owned-object");
    expect(result.diagnostic.typeComparisons.some((comparison) => comparison.matches)).toBe(true);
  });

  it("requires matchedCount to satisfy requiredCount", async () => {
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [createDirectEntry("0x2", PRIME_TYPE)],
      hasNextPage: false,
      nextCursor: null,
    });

    const passResult = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: createEmptyKioskApi() }) },
      "0xwallet",
      [PRIME_TYPE],
      1,
      "sui-mainnet",
      "https://rpc.example",
    );
    const failResult = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: createEmptyKioskApi() }) },
      "0xwallet",
      [PRIME_TYPE],
      2,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(passResult.hasRequiredNft).toBe(true);
    expect(passResult.matchedCount).toBe(1);
    expect(failResult.hasRequiredNft).toBe(false);
    expect(failResult.matchedCount).toBe(1);
    expect(failResult.requiredCount).toBe(2);
    expect(failResult.diagnostic.zeroCountReason).toBe("matched_below_required_count");
  });

  it("does not double count the same objectId across direct and kiosk matches", async () => {
    const sharedObjectId = "0xabc";
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [createDirectEntry(sharedObjectId, PRIME_TYPE)],
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
            objectId: sharedObjectId,
            kioskId: "0xkiosk-1",
            type: PRIME_TYPE,
            isLocked: false,
            data: { type: PRIME_TYPE },
          },
        ],
      }),
    };

    const result = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: kioskApi }) },
      "0xwallet",
      [PRIME_TYPE],
      1,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedCount).toBe(1);
    expect(result.diagnostic.matchedObjectIds).toEqual([
      "0x0000000000000000000000000000000000000000000000000000000000000abc",
    ]);
    expect(result.diagnostic.matchedSources.sort()).toEqual(["direct"]);
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
      1,
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
      1,
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
      1,
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
        isListed: false,
        state: ["placed"],
      },
    ]);
  });

  it("matches an objectId held in a wallet-owned kiosk even without a KioskOwnerCap", async () => {
    const wallet = "0x1";
    const targetObjectId = "0xabc";
    const dynamicFieldObjectId = "0xdef";
    const kioskId = "0x123";
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [],
      hasNextPage: false,
      nextCursor: null,
    });
    const getObject = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          objectId: targetObjectId,
          type: PRIME_TYPE,
          owner: { ObjectOwner: dynamicFieldObjectId },
        },
      })
      .mockResolvedValueOnce({
        data: {
          objectId: dynamicFieldObjectId,
          type: "0x2::dynamic_field::Field<0x2::dynamic_object_field::Wrapper<0x2::kiosk::Item>, 0x2::object::ID>",
          owner: { ObjectOwner: kioskId },
          content: {
            fields: {
              name: {
                type: "0x2::dynamic_object_field::Wrapper<0x2::kiosk::Item>",
              },
              value: targetObjectId,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          objectId: kioskId,
          type: "0x2::kiosk::Kiosk",
          owner: { Shared: { initial_shared_version: 1 } },
          content: {
            fields: {
              owner: wallet,
            },
          },
        },
      });
    const getDynamicFields = vi.fn().mockResolvedValue({
      data: [
        {
          name: {
            type: "0x2::kiosk::Item",
            value: { id: targetObjectId },
          },
          objectType: PRIME_TYPE,
          objectId: targetObjectId,
        },
        {
          name: {
            type: "0x2::kiosk::Lock",
            value: { id: targetObjectId },
          },
          objectType: "bool",
          objectId: "0xlock",
        },
      ],
      hasNextPage: false,
      nextCursor: null,
    });

    const result = await checkOwnedNftsForClient(
      {
        getOwnedObjects,
        getObject,
        getDynamicFields,
        $extend: () => ({ kiosk: createEmptyKioskApi() }),
      },
      wallet,
      [PRIME_TYPE],
      1,
      "sui-mainnet",
      "https://rpc.example",
      [targetObjectId],
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedBy).toBe("kiosk-item");
    expect(result.matchedObjectId).toBe("0x0000000000000000000000000000000000000000000000000000000000000abc");
    expect(result.matchedKioskItems).toEqual([
      {
        objectId: "0x0000000000000000000000000000000000000000000000000000000000000abc",
        kioskId,
        type: PRIME_TYPE,
        isLocked: true,
        isListed: false,
        state: ["placed", "locked"],
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
        1,
        "sui-mainnet",
        "https://rpc.example",
      ),
    ).rejects.toThrow("rpc down");
  });

  it("supports direct ownership checks through Core API clients", async () => {
    const result = await checkOwnedNftsForClient(
      {
        core: {
          listOwnedObjects: vi.fn().mockResolvedValue({
            objects: [
              {
                objectId: "0x2",
                type: PRIME_TYPE,
                owner: {
                  $kind: "AddressOwner",
                  AddressOwner: "0xwallet",
                },
                json: null,
              },
            ],
            hasNextPage: false,
            cursor: null,
          }),
        } as never,
      },
      "0xwallet",
      [PRIME_TYPE],
      1,
      "sui-mainnet",
      "https://grpc.example",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedBy).toBe("owned-object");
    expect(result.diagnostic.rpcTransportUsed).toBe("core-api");
  });

  it("returns a clear diagnostic for an empty wallet", async () => {
    const result = await checkOwnedNftsForClient(
      {
        getOwnedObjects: vi.fn().mockResolvedValue({
          data: [],
          hasNextPage: false,
          nextCursor: null,
        }),
      },
      "0xwallet",
      [PRIME_TYPE],
      1,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(false);
    expect(result.checkedOwnedObjects).toBe(0);
    expect(result.diagnostic.zeroCountReason).toBe("no_direct_objects_and_no_kiosks_detected");
  });

  it("surfaces a normalized type mismatch in diagnostics", async () => {
    const wrongType =
      "0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachinee";
    const result = await checkOwnedNftsForClient(
      {
        getOwnedObjects: vi.fn().mockResolvedValue({
          data: [createDirectEntry("0x2", wrongType)],
          hasNextPage: false,
          nextCursor: null,
        }),
      },
      "0xwallet",
      [PRIME_TYPE],
      1,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(false);
    expect(result.diagnostic.actualTypeBreakdown[0]?.breakdown.struct).toBe("PrimeMachinee");
    expect(result.diagnostic.expectedTypeBreakdown[0]?.struct).toBe("PrimeMachin");
  });

  it("supports PrimeMachin/PrimeMachine compatibility after package upgrade", async () => {
    const upgradedType =
      "0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachine";
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [createDirectEntry("0x2", upgradedType)],
      hasNextPage: false,
      nextCursor: null,
    });

    const result = await checkOwnedNftsForClient(
      { getOwnedObjects, $extend: () => ({ kiosk: createEmptyKioskApi() }) },
      "0xwallet",
      [PRIME_TYPE],
      1,
      "sui-mainnet",
      "https://rpc.example",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedBy).toBe("owned-object");
    expect(result.matchedDirectObjects[0]?.type).toBe(upgradedType);
  });
});
