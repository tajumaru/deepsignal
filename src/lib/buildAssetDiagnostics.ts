import { buildInfo, type BuildInfo } from "./buildInfo";
import { requestBuildUpdateNotice } from "./buildUpdate";

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
    // If session storage is blocked, still surface the manual update action.
  }

  console.warn("mixed_build_assets_detected", {
    root: status.root,
    observed: status.observed,
    reason: status.reason,
  });
  requestBuildUpdateNotice("mixed_build_assets", status.root, { mixedBuildAssetsDetected: true });

  return true;
}
