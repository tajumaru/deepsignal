import { describe, expect, it } from "vitest";
import {
  requiresWorkspaceBoot,
  shouldMountWalletProviders,
  shouldShowWalletUi,
  usesPublicChrome,
} from "./routeRuntimePolicy";

describe("routeRuntimePolicy", () => {
  it("keeps wallet providers off for public and signal discovery routes by default", () => {
    expect(shouldMountWalletProviders("/explore")).toBe(false);
    expect(shouldMountWalletProviders("/f/form-123")).toBe(false);
    expect(shouldMountWalletProviders("/roadmap/form-123")).toBe(false);
    expect(shouldMountWalletProviders("/m/blob-123")).toBe(false);
  });

  it("keeps wallet provider eager boot on private workspace routes", () => {
    expect(shouldMountWalletProviders("/admin")).toBe(true);
    expect(shouldMountWalletProviders("/dashboard")).toBe(true);
    expect(shouldMountWalletProviders("/auth/zklogin/callback")).toBe(true);
  });

  it("shows wallet UI only on wallet-aware private routes", () => {
    expect(shouldShowWalletUi("/dashboard")).toBe(true);
    expect(shouldShowWalletUi("/admin")).toBe(true);
    expect(shouldShowWalletUi("/explore")).toBe(false);
    expect(shouldShowWalletUi("/f/form-123")).toBe(false);
  });

  it("uses public chrome only for wallet-optional public routes", () => {
    expect(usesPublicChrome("/f/form-123")).toBe(true);
    expect(usesPublicChrome("/roadmap/form-123")).toBe(true);
    expect(usesPublicChrome("/m/blob-123")).toBe(true);
    expect(usesPublicChrome("/explore")).toBe(false);
    expect(usesPublicChrome("/dashboard")).toBe(false);
  });

  it("requires workspace boot only for private workspace routes", () => {
    expect(requiresWorkspaceBoot("/dashboard")).toBe(true);
    expect(requiresWorkspaceBoot("/admin")).toBe(true);
    expect(requiresWorkspaceBoot("/explore")).toBe(false);
    expect(requiresWorkspaceBoot("/f/form-123")).toBe(false);
  });
});
