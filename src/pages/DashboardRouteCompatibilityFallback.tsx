import { DashboardShellFirstPanel } from "../components/DashboardShellFirstPanel";

export function DashboardRouteCompatibilityFallback() {
  const routePath =
    typeof window === "undefined" ? "/dashboard" : window.location.hash?.replace(/^#/, "") || window.location.pathname;

  return (
    <DashboardShellFirstPanel
      onRetryWalletRuntime={() => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }}
      routePath={routePath}
      walletStatusMessage="Dashboard route CSS recovery stayed degraded, so DeepSignal opened the shell-first workspace."
    />
  );
}
