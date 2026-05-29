import { readCreateDraftParseStatus, type CreateDraftParseStatus } from "./createDraftDiagnostics";

export { readCreateDraftParseStatus } from "./createDraftDiagnostics";

export type RouteDiagnostics = {
  routePath: string;
  browserPathname: string;
  browserHash: string;
  selectedProjectId: string;
  walletConnectedState: "connected" | "disconnected" | "unknown";
  storageMode: string;
  providerState: Record<string, unknown>;
  hydrationPhase: string;
  localDraftParseStatus: CreateDraftParseStatus;
};

export function getProviderReadiness() {
  if (typeof window === "undefined") {
    return {};
  }
  return window.__DEEPSIGNAL_DEBUG__?.providerReadiness ?? {};
}

export function getRouteId(routePath: string) {
  const pathname = routePath.split(/[?#]/)[0] || "/";
  if (pathname === "/" || pathname === "") {
    return "landing";
  }
  if (pathname === "/explore" || pathname === "/signals") {
    return "explore";
  }
  if (pathname === "/create" || pathname === "/compose") {
    return "create-signal";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "admin";
  }
  if (pathname.startsWith("/f/")) {
    return "public-form";
  }
  if (pathname.startsWith("/roadmap/")) {
    return "public-roadmap";
  }
  if (pathname.startsWith("/m/")) {
    return "manifest-restore";
  }
  if (pathname === "/my-responses" || pathname.startsWith("/my-responses/")) {
    return "my-responses";
  }
  return pathname.replace(/^\/+/, "") || "unknown";
}

export function shouldShowRouteDiagnostics(routePath: string) {
  if (import.meta.env.MODE !== "production") {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("debug") === "1" || routePath.includes("debug=1");
}

export function readPersistedWalletConnectionState(): RouteDiagnostics["walletConnectedState"] {
  if (typeof window === "undefined") {
    return "unknown";
  }

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.toLowerCase().includes("wallet")) {
        continue;
      }
      const value = window.localStorage.getItem(key);
      if (!value) {
        continue;
      }
      const lowerValue = value.toLowerCase();
      if (lowerValue.includes("connected") || lowerValue.includes("currentwallet") || lowerValue.includes("accounts")) {
        return "connected";
      }
    }
    return "disconnected";
  } catch {
    return "unknown";
  }
}

export function readSelectedProjectIdFromStorage() {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem("deepsignal.projectRegistry.selectedProjectId") ?? "";
  } catch {
    return "";
  }
}

export function readStorageRuntimeStatusSnapshot() {
  const requireWalrus = String(import.meta.env.VITE_REQUIRE_WALRUS).toLowerCase() === "true";
  const walrusRequested = requireWalrus || import.meta.env.VITE_STORAGE_MODE === "walrus";
  return {
    mode: walrusRequested ? "walrus" : "local-fallback",
    notice: null as string | null,
  };
}

export function collectRouteDiagnostics(routePath: string): RouteDiagnostics {
  const storageRuntime = readStorageRuntimeStatusSnapshot();
  const providerState = getProviderReadiness();
  const browserPathname = typeof window === "undefined" ? routePath.split(/[?#]/)[0] || "/" : window.location.pathname;
  const browserHash = typeof window === "undefined" ? "" : window.location.hash;
  return {
    routePath,
    browserPathname,
    browserHash,
    selectedProjectId: readSelectedProjectIdFromStorage(),
    walletConnectedState: readPersistedWalletConnectionState(),
    storageMode: storageRuntime.mode,
    providerState,
    hydrationPhase: typeof providerState.hydrationPhase === "string" ? providerState.hydrationPhase : "unknown",
    localDraftParseStatus: readCreateDraftParseStatus(),
  };
}
