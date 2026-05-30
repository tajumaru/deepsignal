import { describe, expect, it } from "vitest";
import { validateMemWalConfig } from "./memwalConfig";

describe("MemWal config validation", () => {
  it("stays disabled by default", () => {
    expect(validateMemWalConfig({} as ImportMetaEnv)).toMatchObject({
      enabled: false,
      configured: false,
      namespacePrefix: "deepsignal",
      missing: [],
      errors: [],
    });
  });

  it("requires all MemWal runtime settings only when explicitly enabled", () => {
    const validation = validateMemWalConfig({
      VITE_MEMWAL_ENABLED: "true",
      VITE_MEMWAL_SERVER_URL: "https://relayer.staging.memwal.ai",
    } as ImportMetaEnv);

    expect(validation.enabled).toBe(true);
    expect(validation.configured).toBe(false);
    expect(validation.missing).toEqual(["VITE_MEMWAL_ACCOUNT_ID", "VITE_MEMWAL_DELEGATE_KEY"]);
  });

  it("accepts a complete placeholder configuration without initializing a client", () => {
    const validation = validateMemWalConfig({
      VITE_MEMWAL_ENABLED: "true",
      VITE_MEMWAL_SERVER_URL: "https://relayer.staging.memwal.ai",
      VITE_MEMWAL_ACCOUNT_ID: "0xmemwalaccount",
      VITE_MEMWAL_DELEGATE_KEY: `0x${"a".repeat(64)}`,
      VITE_MEMWAL_NAMESPACE_PREFIX: "deepsignal:demo",
    } as ImportMetaEnv);

    expect(validation).toMatchObject({
      enabled: true,
      configured: true,
      serverUrl: "https://relayer.staging.memwal.ai",
      accountId: "0xmemwalaccount",
      namespacePrefix: "deepsignal:demo",
      missing: [],
      errors: [],
    });
  });
});
