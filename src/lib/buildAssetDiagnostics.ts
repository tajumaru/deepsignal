import { buildInfo, type BuildInfo } from "./buildInfo";

const observedBuildsKey = "deepsignal.observedBuildAssets";
const mixedBuildReloadKey = "deepsignal.mixedBuildRecovery";

export type BuildAssetRecord = {
  source: string;
  appVersion: string;
  buildTime: string;
  gitHash: string;
  recordedAt: string;
};

type MixedBuildStatus = {
  detected: boolean;
  root: BuildAssetRecord;
  observed: BuildAssetRecord[];
  reason?: "multiple_build_fingerprints" | "route_error_build_mismatch";
};

declare global {
  interface Window {
    __DEEPSIGNAL_BUILD_ASSETS__?: {
      root: BuildAssetRecord;
      observed: BuildAssetRecord[];
      mixedBuildAssetsDetected: boolean;
    };
  }
}

function toBuildRecord(source: string, info: Pick<BuildInfo, "appVersion" | "buildTime" | "gitHash"> = buildInfo): BuildAssetRecord {
  return {
    source,
    appVersion: info.appVersion || "unknown",
    buildTime: info.buildTime || "unknown",
    gitHash: info.gitHash || "unknown",
    recordedAt: new Date().toISOString(),
  };
}

function getBuildId(record: Pick<BuildAssetRecord, "appVersion" | "buildTime" | "gitHash">) {
  return [record.appVersion, record.buildTime, record.gitHash].filter(Boolean).join("|");
}

function readObservedBuilds(): BuildAssetRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(observedBuildsKey);
    const parsed = raw ? (JSON.parse(raw) as BuildAssetRecord[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            item &&
            typeof item.source === "string" &&
            typeof item.appVersion === "string" &&
            typeof item.buildTime === "string" &&
            typeof item.gitHash === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeObservedBuilds(records: BuildAssetRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(observedBuildsKey, JSON.stringify(records.slice(-16)));
  } catch {
    // Build diagnostics are best effort; rendering should not depend on session storage.
  }
}

function publishBuildDebug(root: BuildAssetRecord, observed: BuildAssetRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  const fingerprints = new Set(observed.map(getBuildId));
  window.__DEEPSIGNAL_BUILD_ASSETS__ = {
    root,
    observed,
    mixedBuildAssetsDetected: fingerprints.size > 1,
  };
}

export function recordBuildAsset(source: string, info: Pick<BuildInfo, "appVersion" | "buildTime" | "gitHash"> = buildInfo) {
  if (typeof window === "undefined") {
    return getMixedBuildStatus();
  }

  const nextRecord = toBuildRecord(source, info);
  const nextId = getBuildId(nextRecord);
  const observed = readObservedBuilds();
  const withoutDuplicate = observed.filter((record) => !(record.source === source && getBuildId(record) === nextId));
  const nextObserved = [...withoutDuplicate, nextRecord];
  writeObservedBuilds(nextObserved);
  publishBuildDebug(toBuildRecord("root", buildInfo), nextObserved);
  return getMixedBuildStatus();
}

export function startBuildAssetDiagnostics() {
  const status = recordBuildAsset("root", buildInfo);
  console.info("[DeepSignal build]", {
    event: "root_build_loaded",
    buildVersion: buildInfo.appVersion,
    buildTime: buildInfo.buildTime,
    gitHash: buildInfo.gitHash,
    mixedBuildAssetsDetected: status.detected,
  });
  return status;
}

export function getMixedBuildStatus(): MixedBuildStatus {
  const root = toBuildRecord("root", buildInfo);
  const observed = readObservedBuilds();
  const fingerprints = new Set(observed.map(getBuildId));
  const rootId = getBuildId(root);
  const hasRouteErrorMismatch = observed.some((record) => record.source.startsWith("route-error:") && getBuildId(record) !== rootId);

  return {
    detected: fingerprints.size > 1 || hasRouteErrorMismatch,
    root,
    observed,
    reason: fingerprints.size > 1 ? "multiple_build_fingerprints" : hasRouteErrorMismatch ? "route_error_build_mismatch" : undefined,
  };
}

async function clearBuildRecoveryCaches() {
  try {
    window.sessionStorage.removeItem("deepsignal.chunkLoadRecovery");
    window.sessionStorage.removeItem("deepsignal:lastExploreError");
    window.sessionStorage.removeItem(observedBuildsKey);
    window.localStorage.removeItem("deepsignal:lastExploreError");
  } catch {
    // Best effort only.
  }

  try {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
  } catch {
    // The cache-busted reload below is the important recovery path.
  }
}

export function clearBuildAssetRecoveryState() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(mixedBuildReloadKey);
    window.sessionStorage.removeItem(observedBuildsKey);
  } catch {
    // Best effort only.
  }
}

export function recoverFromMixedBuildAssets(status = getMixedBuildStatus()) {
  if (typeof window === "undefined" || !status.detected) {
    return false;
  }

  const rootId = getBuildId(status.root);
  try {
    const raw = window.sessionStorage.getItem(mixedBuildReloadKey);
    if (raw === rootId) {
      return false;
    }
    window.sessionStorage.setItem(mixedBuildReloadKey, rootId);
  } catch {
    // If session storage is blocked, still try one recovery reload.
  }

  console.warn("mixed_build_assets_detected", {
    root: status.root,
    observed: status.observed,
    reason: status.reason,
  });

  window.setTimeout(() => {
    void clearBuildRecoveryCaches().finally(() => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("mixed-build-retry", String(Date.now()));
      nextUrl.searchParams.set("build", buildInfo.appVersion);
      window.location.replace(nextUrl.toString());
    });
  }, 600);

  return true;
}
