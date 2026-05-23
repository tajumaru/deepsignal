import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveZkLoginIdentityFromIdToken } from "./zkloginAddress";

const mockDecodeJwt = vi.fn();
const mockComputeZkLoginAddress = vi.fn();

vi.mock("@mysten/sui/zklogin", () => ({
  decodeJwt: (...args: unknown[]) => mockDecodeJwt(...args),
  computeZkLoginAddress: (...args: unknown[]) => mockComputeZkLoginAddress(...args),
}));

describe("zkloginAddress", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_ZKLOGIN_SALT_SERVICE_URL", "");
    mockDecodeJwt.mockReset();
    mockComputeZkLoginAddress.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("derives a zkLogin identity with deterministic fallback salt when no salt service is configured", async () => {
    mockDecodeJwt.mockReturnValue({
      nonce: "nonce-123",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      sub: "google-user-sub",
      exp: 1_800_000_000,
    });
    mockComputeZkLoginAddress.mockImplementation(({ userSalt }) => `0xderived-${userSalt.slice(0, 8)}`);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const identity = await deriveZkLoginIdentityFromIdToken("id-token-123", "nonce-123");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockComputeZkLoginAddress).toHaveBeenCalledWith({
      claimName: "sub",
      claimValue: "google-user-sub",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      userSalt: expect.any(String),
      legacyAddress: false,
    });
    expect(identity).toMatchObject({
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      address: expect.stringMatching(/^0xderived-/),
      expiresAt: "2027-01-15T08:00:00.000Z",
    });
    expect(identity.subHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses the configured salt service when present", async () => {
    vi.stubEnv("VITE_ZKLOGIN_SALT_SERVICE_URL", "https://salt.example.com/zklogin");
    mockDecodeJwt.mockReturnValue({
      nonce: "nonce-123",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      sub: "google-user-sub",
    });
    mockComputeZkLoginAddress.mockReturnValue("0xzklogin123");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        userSalt: "123456789",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const identity = await deriveZkLoginIdentityFromIdToken("id-token-123", "nonce-123");

    expect(fetchMock).toHaveBeenCalledWith("https://salt.example.com/zklogin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "google",
        iss: "https://accounts.google.com",
        aud: "google-client-id",
        sub: "google-user-sub",
      }),
    });
    expect(mockComputeZkLoginAddress).toHaveBeenCalledWith({
      claimName: "sub",
      claimValue: "google-user-sub",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      userSalt: "123456789",
      legacyAddress: false,
    });
    expect(identity.address).toBe("0xzklogin123");
  });

  it("rejects tokens whose nonce does not match the expected session nonce", async () => {
    mockDecodeJwt.mockReturnValue({
      nonce: "wrong-nonce",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      sub: "google-user-sub",
    });

    await expect(deriveZkLoginIdentityFromIdToken("id-token-123", "nonce-123")).rejects.toThrow(
      "zkLogin nonce validation failed.",
    );
    expect(mockComputeZkLoginAddress).not.toHaveBeenCalled();
  });
});
