import { describe, expect, it } from "vitest";
import {
  getRouteRuntimeMetadata,
  requiresWorkspaceBoot,
  shouldMountWalletProviders,
  shouldShowWalletUi,
  usesPublicChrome,
} from "./routeRuntimePolicy";

describe("routeRuntimePolicy", () => {
  it("/explore does not mount wallet providers", () => {
    expect(shouldMountWalletProviders("/explore")).toBe(false);
  });

  it("/f/form_xxx does not mount wallet providers", () => {
    expect(shouldMountWalletProviders("/f/form_xxx")).toBe(false);
  });

  it("/roadmap/form_xxx does not mount wallet providers", () => {
    expect(shouldMountWalletProviders("/roadmap/form_xxx")).toBe(false);
  });

  it("/troubleshooting does not mount wallet providers", () => {
    expect(shouldMountWalletProviders("/troubleshooting")).toBe(false);
  });

  it("keeps wallet providers off for other wallet-optional public routes", () => {
    expect(shouldMountWalletProviders("/m/blob-123")).toBe(false);
  });

  it("keeps wallet provider eager boot only on wallet-hydrated private workspace routes", () => {
    expect(shouldMountWalletProviders("/admin")).toBe(true);
    expect(shouldMountWalletProviders("/dashboard")).toBe(false);
    expect(shouldMountWalletProviders("/create")).toBe(false);
    expect(shouldMountWalletProviders("/compose")).toBe(false);
    expect(shouldMountWalletProviders("/admin/forms/new")).toBe(false);
    expect(shouldMountWalletProviders("/auth/zklogin/callback")).toBe(false);
  });

  it("/dashboard shows wallet UI", () => {
    expect(shouldShowWalletUi("/dashboard")).toBe(true);
  });

  it("shows wallet UI only on wallet-aware private routes", () => {
    expect(shouldShowWalletUi("/admin")).toBe(true);
    expect(shouldShowWalletUi("/explore")).toBe(false);
    expect(shouldShowWalletUi("/f/form_xxx")).toBe(false);
    expect(shouldShowWalletUi("/troubleshooting")).toBe(false);
  });

  it("public chrome routes are detected correctly", () => {
    expect(usesPublicChrome("/f/form_xxx")).toBe(true);
    expect(usesPublicChrome("/roadmap/form-123")).toBe(true);
    expect(usesPublicChrome("/m/blob-123")).toBe(true);
    expect(usesPublicChrome("/auth/zklogin/callback")).toBe(true);
    expect(usesPublicChrome("/explore")).toBe(false);
    expect(usesPublicChrome("/dashboard")).toBe(false);
  });

  it("/dashboard requires workspace boot", () => {
    expect(requiresWorkspaceBoot("/dashboard")).toBe(true);
  });

  it("/explore does not require workspace boot", () => {
    expect(requiresWorkspaceBoot("/explore")).toBe(false);
  });

  it("requires workspace boot only for private workspace routes", () => {
    expect(requiresWorkspaceBoot("/admin")).toBe(true);
    expect(requiresWorkspaceBoot("/f/form_xxx")).toBe(false);
  });

  it("treats private workspace routes as wallet-aware without content-gating them", () => {
    expect(getRouteRuntimeMetadata("/dashboard")).toMatchObject({ walletRequired: false, publicRoute: false, optionalWallet: true });
    expect(getRouteRuntimeMetadata("/admin")).toMatchObject({ walletRequired: false, publicRoute: false, optionalWallet: true });
    expect(getRouteRuntimeMetadata("/create")).toMatchObject({ walletRequired: false, publicRoute: false, optionalWallet: true });
  });
});
