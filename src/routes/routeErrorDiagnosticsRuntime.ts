import { buildInfo } from "../lib/buildInfo";
import { formatRouteLifecycleDiagnostics } from "../lib/routeDiagnostics";
import {
  collectRouteDiagnostics,
  getProviderReadiness,
  getRouteId,
  type RouteDiagnostics,
} from "./routeDiagnostics";
import type { BuildAssetRecord } from "../lib/buildAssetDiagnostics";
import type { ChunkDependencyProbe, ChunkProbe } from "../lib/routeDiagnostics";
import type { getChunkLoadRecoverySnapshot } from "../lib/chunkLoadRecovery";

export type RouteErrorDiagnostics = {
  errorName: string;
  errorMessage: string;
  errorStack: string;
  componentStack: string;
  routeId: string;
  routePath: string;
  pathname: string;
  hash: string;
  chunkUrl: string | null;
  buildVersion: string;
  buildTime: string;
  gitHash: string;
  rootBuildVersion: string;
  rootBuildTime: string;
  rootGitHash: string;
  mixedBuildAssetsDetected: boolean;
  observedBuildAssets: BuildAssetRecord[];
  userAgent: string;
  providerReadiness: Record<string, unknown>;
  providerState: Record<string, unknown>;
  hydrationPhase: string;
  storageMode: string;
  selectedProjectId: string;
  routeDiagnostics: RouteDiagnostics;
  routeLifecycle: string;
  chunkRecovery: ReturnType<typeof getChunkLoadRecoverySnapshot>;
  failedImportDiagnostics: Array<{
    at: number;
    label: string;
    message: string;
    chunkUrl?: string | null;
    category?: "chunkLoad" | "missingExport" | "runtime" | "timeout";
    expectedExport?: string;
    availableExports?: string[];
    moduleKeys?: string[];
    routeId?: string;
    routePath?: string;
    currentUrl?: string;
    pathname?: string;
    hash?: string;
    userAgent?: string;
    mobileSafari?: boolean;
    resolvedExport?: "default" | string | "missing";
    probe?: ChunkProbe;
    dependencyProbe?: ChunkDependencyProbe;
  }>;
  recordedAt: string;
};

type BuildRouteErrorDiagnosticsInput = {
  chunkRecovery: ReturnType<typeof getChunkLoadRecoverySnapshot>;
  chunkUrl: string | null;
  componentStack: string;
  error: Error | null;
  failedImportDiagnostics: RouteErrorDiagnostics["failedImportDiagnostics"];
  hash: string;
  mixedBuildStatus: {
    detected: boolean;
    observed: BuildAssetRecord[];
    root: BuildAssetRecord;
  };
  pathname: string;
  routePath: string;
  userAgent: string;
};

export function buildRouteErrorDiagnostics({
  chunkRecovery,
  chunkUrl,
  componentStack,
  error,
  failedImportDiagnostics,
  hash,
  mixedBuildStatus,
  pathname,
  routePath,
  userAgent,
}: BuildRouteErrorDiagnosticsInput): RouteErrorDiagnostics {
  const routeDiagnostics = collectRouteDiagnostics(routePath);
  return {
    routePath,
    routeId: getRouteId(routePath),
    pathname,
    hash,
    errorName: error?.name ?? "unknown",
    errorMessage: error?.message ?? "unknown",
    errorStack: error?.stack ?? "",
    chunkUrl,
    buildVersion: buildInfo.appVersion,
    buildTime: buildInfo.buildTime,
    gitHash: buildInfo.gitHash,
    rootBuildVersion: mixedBuildStatus.root.appVersion,
    rootBuildTime: mixedBuildStatus.root.buildTime,
    rootGitHash: mixedBuildStatus.root.gitHash,
    mixedBuildAssetsDetected: mixedBuildStatus.detected,
    observedBuildAssets: mixedBuildStatus.observed,
    userAgent,
    providerReadiness: getProviderReadiness(),
    providerState: routeDiagnostics.providerState,
    hydrationPhase: routeDiagnostics.hydrationPhase,
    storageMode: routeDiagnostics.storageMode,
    selectedProjectId: routeDiagnostics.selectedProjectId,
    routeDiagnostics,
    routeLifecycle: formatRouteLifecycleDiagnostics(),
    chunkRecovery,
    failedImportDiagnostics,
    componentStack,
    recordedAt: new Date().toISOString(),
  };
}
