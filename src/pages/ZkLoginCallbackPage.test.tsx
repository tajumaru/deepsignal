import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZkLoginCallbackPage } from "./ZkLoginCallbackPage";

const mockConsumeGoogleZkLoginOAuthState = vi.fn();
const mockExchangeGoogleCodeForIdToken = vi.fn();
const mockDeriveZkLoginIdentityFromIdToken = vi.fn();
const mockSaveZkLoginSession = vi.fn();

vi.mock("../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        zkLoginCallbackFinalizing: "Finalizing Google zkLogin...",
        zkLoginCallbackExchanging: "Exchanging Google authorization...",
        zkLoginCallbackDeriving: "Deriving zkLogin address...",
        zkLoginCallbackFailed: "Google zkLogin could not be completed.",
        zkLoginCallbackVerifyingBody: "DeepSignal is verifying your Google session and restoring the public form.",
        zkLoginCallbackMissingCode: "Google zkLogin callback was missing the authorization code.",
        zkLoginCallbackFailedGeneric: "zkLogin sign-in failed.",
        zkLoginCallbackEyebrow: "Public identity",
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("../lib/zkloginOAuth", () => ({
  consumeGoogleZkLoginOAuthState: (...args: unknown[]) => mockConsumeGoogleZkLoginOAuthState(...args),
  exchangeGoogleCodeForIdToken: (...args: unknown[]) => mockExchangeGoogleCodeForIdToken(...args),
}));

vi.mock("../lib/zkloginAddress", () => ({
  deriveZkLoginIdentityFromIdToken: (...args: unknown[]) => mockDeriveZkLoginIdentityFromIdToken(...args),
}));

vi.mock("../lib/zkloginSession", () => ({
  saveZkLoginSession: (...args: unknown[]) => mockSaveZkLoginSession(...args),
}));

function renderCallbackPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/auth/zklogin/callback" element={<ZkLoginCallbackPage />} />
        <Route path="/f/:formId" element={<div>Restored public form</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ZkLoginCallbackPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockConsumeGoogleZkLoginOAuthState.mockReset();
    mockExchangeGoogleCodeForIdToken.mockReset();
    mockDeriveZkLoginIdentityFromIdToken.mockReset();
    mockSaveZkLoginSession.mockReset();
  });

  it("restores the originating public form after saving the derived zkLogin session", async () => {
    mockConsumeGoogleZkLoginOAuthState.mockReturnValue({
      returnTo: "/f/form-123?manifest=blob-abc",
      nonce: "nonce-123",
    });
    mockExchangeGoogleCodeForIdToken.mockResolvedValue("id-token-123");
    mockDeriveZkLoginIdentityFromIdToken.mockResolvedValue({
      address: "0xzklogin123",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      subHash: "hashed-sub",
      expiresAt: "2026-05-23T15:00:00.000Z",
    });

    renderCallbackPage("/auth/zklogin/callback?code=oauth-code&state=opaque-state");

    await waitFor(() => expect(screen.getByText("Restored public form")).toBeInTheDocument());
    expect(mockConsumeGoogleZkLoginOAuthState).toHaveBeenCalledWith("opaque-state");
    expect(mockExchangeGoogleCodeForIdToken).toHaveBeenCalledWith("oauth-code", {
      returnTo: "/f/form-123?manifest=blob-abc",
      nonce: "nonce-123",
    });
    expect(mockDeriveZkLoginIdentityFromIdToken).toHaveBeenCalledWith("id-token-123", "nonce-123");
    expect(mockSaveZkLoginSession).toHaveBeenCalledWith({
      provider: "google",
      address: "0xzklogin123",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      subHash: "hashed-sub",
      expiresAt: "2026-05-23T15:00:00.000Z",
    });
  });

  it("shows a public-safe error when Google returns an OAuth failure", async () => {
    renderCallbackPage("/auth/zklogin/callback?error=access_denied&error_description=Google%20sign-in%20was%20canceled.");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Google zkLogin could not be completed."),
    );
    expect(screen.getByText("Google sign-in was canceled.")).toBeInTheDocument();
    expect(mockConsumeGoogleZkLoginOAuthState).not.toHaveBeenCalled();
    expect(mockExchangeGoogleCodeForIdToken).not.toHaveBeenCalled();
    expect(mockSaveZkLoginSession).not.toHaveBeenCalled();
  });
});
