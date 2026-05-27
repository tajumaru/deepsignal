import { recoverFromChunkLoadFailure } from "./chunkLoadRecovery";
import { buildInfo, type BuildInfo } from "./buildInfo";
import { recordBuildAsset } from "./buildAssetDiagnostics";
import { endPerf, startPerf } from "./perf";
import { recordFailedImport } from "./routeDiagnostics";

const lazyImportAttempts = 3;
const lazyImportBaseDelayMs = 450;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const expectedRouteChunkByLabel: Record<string, string> = {
  "route-access-management": "AccessManagementPage.js",
  "route-admin-dashboard": "AdminDashboardPage.js",
  "route-explore": "ExploreSignalsPage.js",
  "route-form-builder": "FormBuilderPage.js",
  "prefetch-route-explore": "ExploreSignalsPage.js",
  "route-insights-fixture": "InsightsFixturePage.js",
  "route-landing": "LandingPage.js",
  "route-manifest-restore": "ManifestRestorePage.js",
  "route-public-form": "PublicFormPage.js",
  "route-public-roadmap": "PublicRoadmapPage.js",
  "route-submission-detail": "SubmissionDetailPage.js",
  "route-troubleshooting": "TroubleshootingPage.js",
  "route-zklogin-callback": "ZkLoginCallbackPage.js",
};

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

function getExpectedChunkUrl(label: string) {
  if (typeof window === "undefined") {
    return null;
  }
  const chunkName = expectedRouteChunkByLabel[label];
  if (!chunkName) {
    return null;
  }
  return new URL(`./assets/${chunkName}`, window.location.origin + window.location.pathname).toString();
}

export async function retryLazyImport<T>(loader: () => Promise<T>, label = "anonymous"): Promise<T> {
  let lastError: unknown;
  const perfName = `lazy:${label}`;
  const expectedChunkUrl = getExpectedChunkUrl(label);
  startPerf(perfName);

  for (let attempt = 1; attempt <= lazyImportAttempts; attempt += 1) {
    try {
      const result = await loader();
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
