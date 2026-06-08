import { afterEach, describe, expect, it } from "vitest";
import {
  ensureCurrentRouteEpoch,
  getCurrentRouteEpochSnapshot,
  resetCurrentRouteEpochForTests,
  setCurrentRouteEpoch,
} from "./routeEpoch";

describe("routeEpoch", () => {
  afterEach(() => {
    resetCurrentRouteEpochForTests();
  });

  it("does not advance the navigation epoch when the raw hash route resolves to the same canonical route", () => {
    const hashSnapshot = setCurrentRouteEpoch("/#/create");
    const canonicalSnapshot = ensureCurrentRouteEpoch("/create");

    expect(canonicalSnapshot.navigationId).toBe(hashSnapshot.navigationId);
    expect(canonicalSnapshot.routeEpoch).toBe(hashSnapshot.routeEpoch);
    expect(canonicalSnapshot.routePath).toBe("/create");
    expect(canonicalSnapshot.canonicalRoutePath).toBe("/create");
  });

  it("ignores query and hash churn for the same canonical route", () => {
    const first = setCurrentRouteEpoch("/dashboard?tab=signals");
    const second = ensureCurrentRouteEpoch("/dashboard#review");

    expect(second.navigationId).toBe(first.navigationId);
    expect(second.routeEpoch).toBe(first.routeEpoch);
    expect(second.routePath).toBe("/dashboard#review");
    expect(second.canonicalRoutePath).toBe("/dashboard");
  });

  it("advances the navigation epoch after a real route change", () => {
    setCurrentRouteEpoch("/create");
    const next = setCurrentRouteEpoch("/dashboard");

    expect(next.navigationId).toBe(2);
    expect(next.routeEpoch).toBe("nav-2:/dashboard");
    expect(getCurrentRouteEpochSnapshot().canonicalRoutePath).toBe("/dashboard");
  });
});
