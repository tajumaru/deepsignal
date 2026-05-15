import { afterEach, describe, expect, it, vi } from "vitest";
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
});
