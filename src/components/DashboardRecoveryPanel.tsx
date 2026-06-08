import { Suspense, lazy, useEffect, useMemo } from "react";
import { DashboardLocalShellFallback } from "./DashboardLocalShellFallback";
import { buildInfo } from "../lib/buildInfo";
import { logRouteLifecycle } from "../lib/routeDiagnostics";

const LazyLocalRecoveryCenter = lazy(() =>
  import("./LocalRecoveryCenter").then((module) => ({
    default: module.LocalRecoveryCenter,
  })),
);

type DashboardFailedImport = {
  at?: number;
  label?: string;
  message?: string;
  chunkUrl?: string | null;
  attempt?: number;
  category?: string;
  probe?: {
    status?: number;
    contentType?: string;
    contentLength?: string;
    bodyLooksLikeHtml?: boolean;
    bodyEmpty?: boolean;
    ok?: boolean;
  };
  dependencyProbe?: {
    totalCount?: number;
    failedCount?: number;
  };
};

function readLatestDashboardImportFailure(): DashboardFailedImport | null {
  if (typeof window === "undefined") {
    return null;
  }
  const failedImports = window.__DEEPSIGNAL_DEBUG__?.failedImports ?? [];
  for (let index = failedImports.length - 1; index >= 0; index -= 1) {
    const entry = failedImports[index];
    if (entry.label === "route-admin-dashboard") {
      return entry;
    }
  }
  return null;
}

export function DashboardRecoveryPanel({
  error,
  onRetry,
  routePath,
}: {
  error: unknown;
  onRetry: () => void;
  routePath: string;
}) {
  const latestFailure = useMemo(() => readLatestDashboardImportFailure(), []);
  const errorName = error instanceof Error ? error.name : "Error";
  const errorMessage = error instanceof Error ? error.message : String(error ?? "Unknown dashboard route failure");

  useEffect(() => {
    logRouteLifecycle("dashboard:route-recovery-panel-render", {
      routePath,
      buildVersion: buildInfo.appVersion,
      errorName,
      errorMessage,
      failedImport: latestFailure,
    });
  }, [errorMessage, errorName, latestFailure, routePath]);

  return (
    <>
      <DashboardLocalShellFallback
        error={error}
        onRetry={onRetry}
        routePath={routePath}
        title="Advanced dashboard failed to load."
      />
      <Suspense fallback={null}>
        <LazyLocalRecoveryCenter />
      </Suspense>
    </>
  );
}
