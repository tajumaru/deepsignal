import { describe, expect, it } from "vitest";
import { buildOwnedObjectsRpcParams } from "./usePublicNftGate";

describe("buildOwnedObjectsRpcParams", () => {
  it("packs filter and options into the query object expected by suix_getOwnedObjects", () => {
    expect(
      buildOwnedObjectsRpcParams({
        owner: "0xabc123",
        filter: {
          StructType: "0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachin",
        },
        options: {
          showType: true,
          showContent: true,
        },
        cursor: "cursor-1",
        limit: 50,
      }),
    ).toEqual([
      "0xabc123",
      {
        filter: {
          StructType: "0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachin",
        },
        options: {
          showType: true,
          showContent: true,
        },
      },
      "cursor-1",
      50,
    ]);
  });

  it("uses null for an empty query payload", () => {
    expect(
      buildOwnedObjectsRpcParams({
        owner: "0xabc123",
        cursor: null,
        limit: 50,
      }),
    ).toEqual(["0xabc123", null, null, 50]);
  });
});
