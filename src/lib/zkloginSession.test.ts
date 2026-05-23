import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearZkLoginOAuthState,
  clearZkLoginSession,
  loadZkLoginOAuthState,
  loadZkLoginSession,
  saveZkLoginOAuthState,
  saveZkLoginSession,
} from "./zkloginSession";

describe("zkloginSession", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("loads a valid zkLogin session from sessionStorage", () => {
    saveZkLoginSession({
      provider: "google",
      address: "0xzklogin123",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      subHash: "hashed-sub",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(loadZkLoginSession()).toMatchObject({
      provider: "google",
      address: "0xzklogin123",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      subHash: "hashed-sub",
    });
  });

  it("clears expired zkLogin sessions instead of restoring them", () => {
    saveZkLoginSession({
      provider: "google",
      address: "0xexpired",
      iss: "https://accounts.google.com",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(loadZkLoginSession()).toBeNull();
    expect(window.sessionStorage.getItem("deepsignal.zklogin.session")).toBeNull();
  });

  it("stores and clears oauth state for callback restoration", () => {
    saveZkLoginOAuthState({
      state: "opaque-state",
      nonce: "nonce-123",
      codeVerifier: "code-verifier",
      returnTo: "/f/form-123?manifest=blob-abc",
      createdAt: "2026-05-23T10:00:00.000Z",
    });

    expect(loadZkLoginOAuthState()).toMatchObject({
      state: "opaque-state",
      nonce: "nonce-123",
      codeVerifier: "code-verifier",
      returnTo: "/f/form-123?manifest=blob-abc",
    });

    clearZkLoginOAuthState();
    clearZkLoginSession();
    expect(loadZkLoginOAuthState()).toBeNull();
    expect(loadZkLoginSession()).toBeNull();
  });
});
