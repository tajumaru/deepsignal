import { afterEach, describe, expect, it, vi } from "vitest";
import type { SealAdapter } from "../types";

describe("sealService production runtime", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("rejects mock Seal mode in production", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_SEAL_MODE", "mock");
    vi.stubEnv("VITE_SEAL_PACKAGE_ID", "0xpackage");
    vi.stubEnv("VITE_SEAL_KEY_SERVER_OBJECT_ID", "0xserver");

    const sealService = await import("./sealService");

    expect(sealService.getSealRuntimeStatus().canEncrypt).toBe(false);
    await expect(sealService.encryptSensitiveResponse("secret")).rejects.toThrow(sealService.SEAL_UNAVAILABLE_MESSAGE);
  });

  it("rejects mock adapters in production decrypt paths", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_SEAL_PACKAGE_ID", "0xpackage");
    vi.stubEnv("VITE_SEAL_KEY_SERVER_OBJECT_ID", "0xserver");

    const sealService = await import("./sealService");
    const mockAdapter: SealAdapter = {
      encrypt: vi.fn(async (value) => value),
      decrypt: vi.fn(async () => "plaintext"),
    };

    await expect(
      sealService.decryptSensitiveResponse("{}", {}, mockAdapter),
    ).rejects.toThrow("Production Seal runtime must use the real Seal adapter.");
  });
});
