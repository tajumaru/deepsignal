import { describe, expect, it, vi } from "vitest";
import { checkOwnedNftsForClient } from "./nftOwnership";

describe("checkOwnedNftsForClient", () => {
  it("counts direct holdings and kiosk items together", async () => {
    const getOwnedObjects = vi.fn().mockResolvedValue({
      data: [
        {
          data: {
            objectId: "0xdirect-1",
            type: "0x2::coin::Coin<0x2::sui::SUI>",
          },
        },
      ],
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
            objectId: "0xitem-1",
            kioskId: "0xkiosk-1",
            type: "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
            isLocked: false,
            data: {
              type: "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
            },
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
      ["0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally"],
      "sui-mainnet",
    );

    expect(result.hasRequiredNft).toBe(true);
    expect(result.matchedCount).toBe(1);
    expect(result.directOwnedCount).toBe(1);
    expect(result.kioskCount).toBe(1);
    expect(result.kioskItemCount).toBe(1);
    expect(result.matchedDirectObjects).toEqual([]);
    expect(result.matchedKioskItems).toEqual([
      {
        objectId: "0xitem-1",
        kioskId: "0xkiosk-1",
        type: "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally",
        isLocked: false,
      },
    ]);
    expect(result.diagnostic).toMatchObject({
      connectedAddress: "0xwallet",
      network: "sui-mainnet",
      targetTypes: ["0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally"],
      directOwnedCount: 1,
      kioskCount: 1,
      kioskItemCount: 1,
    });
  });
});
