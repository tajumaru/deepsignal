import { recoverFromChunkLoadFailure } from "./chunkLoadRecovery";
import { buildInfo, type BuildInfo } from "./buildInfo";
import { recordBuildAsset } from "./buildAssetDiagnostics";
import { endPerf, startPerf } from "./perf";
import { recordFailedImport, recordFailedImportProbe } from "./routeDiagnostics";

const lazyImportAttempts = 3;
const lazyImportBaseDelayMs = 450;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type BuildManifest = {
  assets?: string[];
  routeAssets?: Partial<Record<RouteAssetKey, string[]>>;
};

type ChunkProbe = {
  bodyHash?: string;
  contentLength?: string;
  contentType?: string;
  ok: boolean;
  snippet?: string;
  status?: number;
  url: string;
};

type RouteAssetKey =
  | "access"
  | "admin"
  | "create"
  | "explore"
  | "insightsFixture"
  | "landing"
  | "manifestRestore"
  | "publicForm"
  | "publicRoadmap"
  | "submissionDetail"
  | "troubleshooting"
  | "zkloginCallback";

type RouteChunkSpec = {
  exportName: string;
  filePrefix: string;
  routeKey: RouteAssetKey;
};

const routeChunkByLabel: Record<string, RouteChunkSpec> = {
  "route-access-management": { exportName: "AccessManagementPage", filePrefix: "AccessManagementPage", routeKey: "access" },
  "route-admin-dashboard": { exportName: "AdminDashboardPage", filePrefix: "AdminDashboardPage", routeKey: "admin" },
  "route-explore": { exportName: "ExploreSignalsPage", filePrefix: "ExploreSignalsPage", routeKey: "explore" },
  "route-form-builder": { exportName: "FormBuilderPage", filePrefix: "FormBuilderPage", routeKey: "create" },
  "prefetch-route-explore": { exportName: "ExploreSignalsPage", filePrefix: "ExploreSignalsPage", routeKey: "explore" },
  "route-insights-fixture": { exportName: "InsightsFixturePage", filePrefix: "InsightsFixturePage", routeKey: "insightsFixture" },
  "route-landing": { exportName: "LandingPage", filePrefix: "LandingPage", routeKey: "landing" },
  "route-manifest-restore": { exportName: "ManifestRestorePage", filePrefix: "ManifestRestorePage", routeKey: "manifestRestore" },
  "route-public-form": { exportName: "PublicFormPage", filePrefix: "PublicFormPage", routeKey: "publicForm" },
  "route-public-roadmap": { exportName: "PublicRoadmapPage", filePrefix: "PublicRoadmapPage", routeKey: "publicRoadmap" },
  "route-submission-detail": { exportName: "SubmissionDetailPage", filePrefix: "SubmissionDetailPage", routeKey: "submissionDetail" },
  "route-troubleshooting": { exportName: "TroubleshootingPage", filePrefix: "TroubleshootingPage", routeKey: "troubleshooting" },
  "route-zklogin-callback": { exportName: "ZkLoginCallbackPage", filePrefix: "ZkLoginCallbackPage", routeKey: "zkloginCallback" },
  "wallet-providers": { exportName: "WalletProviders", filePrefix: "providers", routeKey: "admin" },
  "walrus-runtime-provider": { exportName: "WalrusRuntimeProvider", filePrefix: "providers", routeKey: "admin" },
};

let buildManifestPromise: Promise<BuildManifest | null> | null = null;

function getModuleBuildInfo(module: unknown): Pick<BuildInfo, "appVersion" | "buildTime" | "gitHash"> | null {
  if (!module || typeof module !== "object") {
    return null;
  }
  let value: unknown;
  try {
    value = (module as { DEEPSIGNAL_ROUTE_BUILD?: unknown }).DEEPSIGNAL_ROUTE_BUILD;
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<BuildInfo>;
  if (
    typeof candidate.appVersion === "string" &&
    typeof candidate.buildTime === "string" &&
    typeof candidate.gitHash === "string"
  ) {
    return {
      appVersion: candidate.appVersion,
      buildTime: candidate.buildTime,
      gitHash: candidate.gitHash,
    };
  }
  return null;
}

function getRouteAssetBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.location.origin + window.location.pathname;
}

function resolveAssetUrl(assetPath: string) {
  const baseUrl = getRouteAssetBaseUrl();
  if (!baseUrl) {
    return null;
  }
  return new URL(assetPath.replace(/^\.\//, "./"), baseUrl).toString();
}

async function loadBuildManifest() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!buildManifestPromise) {
    buildManifestPromise = fetch(resolveAssetUrl("./build.json") ?? "/build.json", {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`build.json returned ${response.status}`);
        }
        return (await response.json()) as BuildManifest;
      })
      .catch((error) => {
        console.warn("DeepSignal failed to load build manifest for route chunk diagnostics.", error);
        return null;
      });
  }
  return buildManifestPromise;
}

async function getExpectedChunkUrl(label: string) {
  const spec = routeChunkByLabel[label];
  if (!spec) {
    return null;
  }
  const manifest = await loadBuildManifest();
  const routeAssets = manifest?.routeAssets?.[spec.routeKey] ?? [];
  const candidateAssets = routeAssets.length > 0 ? routeAssets : manifest?.assets ?? [];
  const chunkPath = routeAssets.find((assetPath) => {
    const fileName = assetPath.split("/").pop() ?? "";
    return fileName.startsWith(`${spec.filePrefix}-`) && fileName.endsWith(".js");
  }) ?? candidateAssets.find((assetPath) => {
    const fileName = assetPath.split("/").pop() ?? "";
    return fileName.startsWith(`${spec.filePrefix}-`) && fileName.endsWith(".js");
  });
  return chunkPath ? resolveAssetUrl(chunkPath) : null;
}

function appendCacheBust(url: string, attempt: number) {
  const nextUrl = new URL(url, window.location.href);
  nextUrl.searchParams.set("route-chunk-cache-bust", `${Date.now()}-${attempt}`);
  nextUrl.searchParams.set("build", buildInfo.appVersion);
  return nextUrl.toString();
}

function hashSnippet(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
}

async function probeChunk(url: string): Promise<ChunkProbe> {
  try {
    const response = await fetch(appendCacheBust(url, 0), {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    const body = await response.text();
    const snippet = body.slice(0, 180).replace(/\s+/g, " ");
    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length") || String(body.length);
    const bodyLooksLikeHtml = /^<!doctype html/i.test(body) || /^<html/i.test(body);
    const bodyLooksLikeGatewayError = body.includes("upstream connect error") || body.includes("reset before headers");
    const ok =
      response.ok &&
      (contentType.includes("javascript") || contentType.includes("ecmascript") || contentType.includes("application/x-javascript")) &&
      !bodyLooksLikeHtml &&
      !bodyLooksLikeGatewayError;
    return {
      bodyHash: hashSnippet(snippet),
      contentLength,
      contentType,
      ok,
      snippet,
      status: response.status,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      snippet: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

async function importCacheBustedRouteChunk<T>(label: string, chunkUrl: string, attempt: number): Promise<T | null> {
  const spec = routeChunkByLabel[label];
  if (!spec) {
    return null;
  }
  const cacheBustedUrl = appendCacheBust(chunkUrl, attempt);
  const module = (await import(/* @vite-ignore */ cacheBustedUrl)) as Record<string, unknown>;
  const exported = module[spec.exportName] ?? module.default;
  if (!exported) {
    throw new Error(`Route chunk ${label} loaded but export ${spec.exportName} was missing.`);
  }
  return { ...module, default: exported } as T;
}

export async function retryLazyImport<T>(loader: () => Promise<T>, label = "anonymous"): Promise<T> {
  let lastError: unknown;
  const perfName = `lazy:${label}`;
  const expectedChunkUrl = await getExpectedChunkUrl(label);
  startPerf(perfName);

  for (let attempt = 1; attempt <= lazyImportAttempts; attempt += 1) {
    try {
      const result =
        attempt === 1 || !expectedChunkUrl
          ? await loader()
          : (await importCacheBustedRouteChunk<T>(label, expectedChunkUrl, attempt)) ?? (await loader());
      const moduleBuildInfo = getModuleBuildInfo(result) ?? buildInfo;
      recordBuildAsset(`lazy:${label}`, moduleBuildInfo);
      console.info("[DeepSignal route chunk]", {
        label,
        chunkUrl: expectedChunkUrl,
        buildVersion: moduleBuildInfo.appVersion,
        buildTime: moduleBuildInfo.buildTime,
        gitHash: moduleBuildInfo.gitHash,
      });
      endPerf(perfName, "ok", `attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      recordFailedImport(label, error, expectedChunkUrl);
      if (expectedChunkUrl) {
        const probe = await probeChunk(expectedChunkUrl);
        recordFailedImportProbe(label, probe);
        console.warn("[DeepSignal route chunk probe]", {
          label,
          attempt,
          errorName: error instanceof Error ? error.name : "Error",
          errorMessage: error instanceof Error ? error.message : String(error),
          ...probe,
        });
      }
      if (attempt === lazyImportAttempts) {
        break;
      }
      await wait(lazyImportBaseDelayMs * attempt);
    }
  }

  recoverFromChunkLoadFailure(lastError);
  endPerf(perfName, "failed", lastError instanceof Error ? lastError.message : String(lastError));
  throw lastError;
}
