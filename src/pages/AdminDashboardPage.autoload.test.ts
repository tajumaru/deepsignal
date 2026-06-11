import { afterEach, describe, expect, it, vi } from "vitest";

const capabilitySnapshot = {
  mobileSafari: false,
};

vi.mock("../lib/routeDiagnostics", async () => {
  const actual = await vi.importActual("../lib/routeDiagnostics");
  return {
    ...actual,
    getBrowserCapabilitiesSnapshot: () => capabilitySnapshot,
  };
});

import { shouldAutoLoadAdvancedWorkspace } from "./adminDashboardWorkspaceAutoload";

describe("shouldAutoLoadAdvancedWorkspace", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    capabilitySnapshot.mobileSafari = false;
    window.matchMedia = originalMatchMedia;
  });

  it("auto-loads the advanced workspace on desktop dashboard routes", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia;

    expect(shouldAutoLoadAdvancedWorkspace("/dashboard")).toBe(true);
    expect(shouldAutoLoadAdvancedWorkspace("/dashboard?tab=review")).toBe(true);
    expect(shouldAutoLoadAdvancedWorkspace("/admin")).toBe(true);
  });

  it("keeps the lite workspace on mobile Safari", () => {
    capabilitySnapshot.mobileSafari = true;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia;

    expect(shouldAutoLoadAdvancedWorkspace("/dashboard")).toBe(false);
    expect(shouldAutoLoadAdvancedWorkspace("/admin")).toBe(false);
  });

  it("does not auto-load on narrow viewports or unrelated routes", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;

    expect(shouldAutoLoadAdvancedWorkspace("/dashboard")).toBe(false);
    expect(shouldAutoLoadAdvancedWorkspace("/explore")).toBe(false);
  });
});
