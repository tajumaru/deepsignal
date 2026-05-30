import { describe, expect, it } from "vitest";
import { getMemoryAdapter } from "../../memory";

describe("admin memory imports", () => {
  it("can import the memory adapter factory from admin code paths", () => {
    expect(getMemoryAdapter({ VITE_MEMWAL_ENABLED: "false" } as ImportMetaEnv).kind).toBe("noop");
  });
});
