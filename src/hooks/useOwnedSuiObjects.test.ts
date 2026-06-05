import { describe, expect, it, vi } from "vitest";
import { fetchOwnedSuiObjectsForClient, matchesOwnedObjectType } from "./useOwnedSuiObjects";

describe("matchesOwnedObjectType", () => {
  it("matches the exact struct type", () => {
    expect(
      matchesOwnedObjectType(
        "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
        "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
      ),
    ).toBe(true);
  });

  it("matches after normalizing short and full package addresses", () => {
    expect(
      matchesOwnedObjectType(
        "0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::KioskOwnerCap",
        "0x2::kiosk::KioskOwnerCap",
      ),
    ).toBe(true);
  });

  it("matches a generic instantiation of the required struct type", () => {
    expect(
      matchesOwnedObjectType(
        "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally<0x2::sui::SUI>",
        "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
      ),
    ).toBe(false);
  });

  it("does not match a different struct name", () => {
    expect(
      matchesOwnedObjectType(
        "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Other",
        "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
      ),
    ).toBe(false);
  });
});

describe("fetchOwnedSuiObjectsForClient", () => {
  it("walks every cursor page for a struct-type filtered owned-object query", async () => {
    const getOwnedObjects = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            data: {
              objectId: "0x1",
              type: "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
            },
          },
        ],
        hasNextPage: true,
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        data: [
          {
            data: {
              objectId: "0x2",
              type: "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
            },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      });

    const result = await fetchOwnedSuiObjectsForClient(
      { getOwnedObjects },
      "0xwallet",
      ["0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally"],
    );

    expect(getOwnedObjects).toHaveBeenCalledTimes(2);
    expect(getOwnedObjects).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        owner: "0xwallet",
        cursor: undefined,
        filter: {
          StructType: "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
        },
        options: {
          showType: true,
          showContent: true,
          showOwner: true,
        },
        limit: 50,
      }),
    );
    expect(getOwnedObjects).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        owner: "0xwallet",
        cursor: "cursor-2",
        filter: {
          StructType: "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
        },
        options: {
          showType: true,
          showContent: true,
          showOwner: true,
        },
        limit: 50,
      }),
    );
    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.data?.objectId)).toEqual(["0x1", "0x2"]);
  });
});
