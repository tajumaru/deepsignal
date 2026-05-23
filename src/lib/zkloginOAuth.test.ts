import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginGoogleZkLogin,
  consumeGoogleZkLoginOAuthState,
  exchangeGoogleCodeForIdToken,
  isZkLoginEnabled,
} from "./zkloginOAuth";
import { clearZkLoginOAuthState, loadZkLoginOAuthState, saveZkLoginOAuthState } from "./zkloginSession";

describe("zkloginOAuth", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_ZKLOGIN_ENABLE", "false");
    vi.stubEnv("VITE_ZKLOGIN_GOOGLE_CLIENT_ID", "");
    vi.stubEnv("VITE_ZKLOGIN_REDIRECT_URI", "");
  });

  afterEach(() => {
    window.sessionStorage.clear();
    clearZkLoginOAuthState();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("reports whether zkLogin is enabled from env", () => {
    expect(isZkLoginEnabled()).toBe(false);
    vi.stubEnv("VITE_ZKLOGIN_ENABLE", "true");
    expect(isZkLoginEnabled()).toBe(true);
  });

  it("stores oauth state and redirects to Google with PKCE parameters", async () => {
    vi.stubEnv("VITE_ZKLOGIN_GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("VITE_ZKLOGIN_REDIRECT_URI", "https://example.com/auth/zklogin/callback");
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        assign,
      },
    });

    await beginGoogleZkLogin("/f/form-123?manifest=blob-abc");

    expect(assign).toHaveBeenCalledTimes(1);
    const redirectUrl = assign.mock.calls[0][0] as string;
    const url = new URL(redirectUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/auth/zklogin/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("openid");

    const savedState = loadZkLoginOAuthState();
    expect(savedState?.returnTo).toBe("/f/form-123?manifest=blob-abc");
    expect(savedState?.state).toBe(url.searchParams.get("state"));
    expect(savedState?.nonce).toBe(url.searchParams.get("nonce"));
  });

  it("throws if oauth state cannot be restored or does not match", () => {
    expect(() => consumeGoogleZkLoginOAuthState("missing-state")).toThrow(
      "zkLogin sign-in state could not be restored.",
    );

    saveZkLoginOAuthState({
      state: "expected-state",
      nonce: "nonce-123",
      codeVerifier: "code-verifier",
      returnTo: "/f/form-123",
      createdAt: "2026-05-23T10:00:00.000Z",
    });

    expect(() => consumeGoogleZkLoginOAuthState("different-state")).toThrow(
      "zkLogin sign-in state did not match this session.",
    );
    expect(loadZkLoginOAuthState()).toBeNull();
  });

  it("throws a readable error when token exchange fails", async () => {
    vi.stubEnv("VITE_ZKLOGIN_GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("VITE_ZKLOGIN_REDIRECT_URI", "https://example.com/auth/zklogin/callback");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error_description: "Google token exchange was rejected.",
        }),
      })),
    );

    await expect(
      exchangeGoogleCodeForIdToken("oauth-code", {
        state: "opaque-state",
        nonce: "nonce-123",
        codeVerifier: "code-verifier",
        returnTo: "/f/form-123",
        createdAt: "2026-05-23T10:00:00.000Z",
      }),
    ).rejects.toThrow("Google token exchange was rejected.");
  });
});
