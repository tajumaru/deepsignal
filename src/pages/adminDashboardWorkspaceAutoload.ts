import { getBrowserCapabilitiesSnapshot } from "../lib/routeDiagnostics";

export function shouldAutoLoadAdvancedWorkspace(routePath: string) {
  if (typeof window === "undefined") {
    return false;
  }
  const pathname = routePath.split(/[?#]/)[0] || "/dashboard";
  if (pathname !== "/admin" && pathname !== "/dashboard") {
    return false;
  }
  if (getBrowserCapabilitiesSnapshot().mobileSafari) {
    return false;
  }
  return window.matchMedia?.("(min-width: 901px)").matches ?? true;
}
