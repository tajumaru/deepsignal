import { describe, expect, it } from "vitest";
import { getMemoryAdapter, isMemWalEnabled } from "./factory";
import { NoopMemoryAdapter } from "./noopMemoryAdapter";

describe("getMemoryAdapter", () => {
  it("returns NoopMemoryAdapter when MemWal is disabled", () => {
    const adapter = getMemoryAdapter({ VITE_MEMWAL_ENABLED: "false" } as ImportMetaEnv);

    expect(adapter).toBeInstanceOf(NoopMemoryAdapter);
    expect(adapter.getRuntimeStatus()).toMatchObject({
      kind: "noop",
      enabled: false,
      configured: false,
      reason: "disabled",
    });
  });

  it("reads the MemWal feature flag without creating a runtime client", () => {
    expect(isMemWalEnabled({ VITE_MEMWAL_ENABLED: "true" } as ImportMetaEnv)).toBe(true);
    expect(isMemWalEnabled({ VITE_MEMWAL_ENABLED: "false" } as ImportMetaEnv)).toBe(false);
    expect(isMemWalEnabled({} as ImportMetaEnv)).toBe(false);
  });
});
