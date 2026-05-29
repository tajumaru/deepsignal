import { buildInfo } from "./buildInfo";
import type { ChunkLoadFailureDiagnostics } from "./chunkLoadRecovery";

export type BuildManifest = {
  appVersion?: string;
  buildTime?: string;
  gitHash?: string;
  assets?: string[];
  entryAsset?: string | null;
};

export type BuildUpdateReason = "latest_build_available" | "chunk_load_failure" | "mixed_build_assets";

export type BuildUpdateNotice = {
  reason: BuildUpdateReason;
  currentBuildVersion: string;
  latestBuildVersion: string;
  currentBuild: BuildManifest;
  latestBuild: BuildManifest;
  detectedAt: string;
  mixedBuildAssetsDetected?: boolean;
  chunkFailure?: ChunkLoadFailureDiagnostics;
};

export type BuildUpdateDiagnostics = {
  currentBuildVersion: string;
  latestBuildVersion: string;
  buildTime: string;
  gitHash: string;
  serviceWorkerControllerState: string;
  cacheNamesBefore: string[];
  cacheNamesAfter: string[];
  updateAttempted: boolean;
  updateSucceeded: boolean;
  mixedBuildAssetsDetected: boolean;
  reason?: BuildUpdateReason;
  chunkFailure?: ChunkLoadFailureDiagnostics;
};

const updateCheckDelayMs = 4500;
const updateCheckRetryMs = 30000;
const maxUpdateCheckAttempts = 20;
const assetCheckTimeoutMs = 7000;
const assetCheckLimit = 10;
const updateNoticeEvent = "deepsignal:build-update-available";
const updateAttemptKey = "deepsignal.buildUpdate.attempt";

const temporaryStorageKeys = [
  "deepsignal.chunkLoadRecovery",
  "deepsignal.mixedBuildRecovery",
  "deepsignal.observedBuildAssets",
  "deepsignal.moduleEntryRetry",
  "deepsignal:lastExploreError",
];

declare global {
  interface Window {
    __DEEPSIGNAL_BUILD_UPDATE__?: {
      latestNotice?: BuildUpdateNotice;
      diagnostics?: BuildUpdateDiagnostics;
    };
  }
}

function normalizeBuildValue(value: string | undefined) {
  return String(value || "unknown").trim() || "unknown";
}

export function normalizeBuildId(manifest: BuildManifest) {
  return [
    normalizeBuildValue(manifest.appVersion),
    normalizeBuildValue(manifest.buildTime),
    normalizeBuildValue(manifest.gitHash),
  ].join("|");
}

function currentBuildManifest(): BuildManifest {
  return {
    appVersion: buildInfo.appVersion,
    buildTime: buildInfo.buildTime,
    gitHash: buildInfo.gitHash,
  };
}

function sameBuild(manifest: BuildManifest) {
  return normalizeBuildId(manifest) === normalizeBuildId(currentBuildManifest());
}

function getServiceWorkerControllerState() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return "unavailable";
  }
  return navigator.serviceWorker.controller?.state ?? "none";
}

function publishDiagnostics(diagnostics: BuildUpdateDiagnostics) {
  if (typeof window === "undefined") {
    return;
  }
  window.__DEEPSIGNAL_BUILD_UPDATE__ ??= {};
  window.__DEEPSIGNAL_BUILD_UPDATE__.diagnostics = diagnostics;
  console.info("[DeepSignal update]", diagnostics);
}

function publishNotice(notice: BuildUpdateNotice) {
  if (typeof window === "undefined") {
    return;
  }
  window.__DEEPSIGNAL_BUILD_UPDATE__ ??= {};
  window.__DEEPSIGNAL_BUILD_UPDATE__.latestNotice = notice;
  console.info("[DeepSignal update]", {
    event: "new_version_available",
    currentBuildVersion: notice.currentBuildVersion,
    latestBuildVersion: notice.latestBuildVersion,
    buildTime: notice.latestBuild.buildTime,
    gitHash: notice.latestBuild.gitHash,
    serviceWorkerControllerState: getServiceWorkerControllerState(),
    updateAttempted: false,
    updateSucceeded: false,
    mixedBuildAssetsDetected: Boolean(notice.mixedBuildAssetsDetected),
    reason: notice.reason,
    chunkFailure: notice.chunkFailure,
  });
  window.dispatchEvent(new CustomEvent<BuildUpdateNotice>(updateNoticeEvent, { detail: notice }));
}

function createNotice(
  reason: BuildUpdateReason,
  latestBuild: BuildManifest = currentBuildManifest(),
  options: { mixedBuildAssetsDetected?: boolean; chunkFailure?: ChunkLoadFailureDiagnostics } = {},
): BuildUpdateNotice {
  const currentBuild = currentBuildManifest();
  return {
    reason,
    currentBuildVersion: normalizeBuildId(currentBuild),
    latestBuildVersion: normalizeBuildId(latestBuild),
    currentBuild,
    latestBuild,
    detectedAt: new Date().toISOString(),
    mixedBuildAssetsDetected: options.mixedBuildAssetsDetected,
    chunkFailure: options.chunkFailure,
  };
}

export function requestBuildUpdateNotice(
  reason: BuildUpdateReason,
  latestBuild?: BuildManifest,
  options: { mixedBuildAssetsDetected?: boolean; chunkFailure?: ChunkLoadFailureDiagnostics } = {},
) {
  if (typeof window === "undefined") {
    return;
  }
  publishNotice(createNotice(reason, latestBuild, options));
}

export function subscribeToBuildUpdateNotices(listener: (notice: BuildUpdateNotice) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const existingNotice = window.__DEEPSIGNAL_BUILD_UPDATE__?.latestNotice;
  if (existingNotice) {
    listener(existingNotice);
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<BuildUpdateNotice>).detail);
  };
  window.addEventListener(updateNoticeEvent, handler);
  return () => window.removeEventListener(updateNoticeEvent, handler);
}

async function fetchWithTimeout(url: string, signal: AbortSignal) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), assetCheckTimeoutMs);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return response.ok;
  } finally {
    signal.removeEventListener("abort", abort);
    window.clearTimeout(timeout);
  }
}

async function assetsReady(manifest: BuildManifest, signal: AbortSignal) {
  const assets = (manifest.assets ?? [])
    .filter((asset) => asset.endsWith(".js") || asset.endsWith(".css"))
    .slice(0, assetCheckLimit);

  if (assets.length === 0) {
    return true;
  }

  const checkedAt = Date.now();
  const results = await Promise.all(
    assets.map((asset) => {
      const url = new URL(asset, window.location.href);
      url.searchParams.set("build-check", String(checkedAt));
      return fetchWithTimeout(url.toString(), signal).catch(() => false);
    }),
  );

  return results.every(Boolean);
}

async function fetchLatestBuildManifest(signal?: AbortSignal) {
  const manifestUrl = new URL("./build.json", window.location.href);
  manifestUrl.searchParams.set("build-check", String(Date.now()));

  const response = await fetch(manifestUrl.toString(), {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
    signal,
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  return (await response.json()) as BuildManifest;
}

function readUpdateAttempt() {
  try {
    const raw = window.sessionStorage.getItem(updateAttemptKey);
    return raw ? (JSON.parse(raw) as { latestBuildVersion?: string; attemptedAt?: number }) : null;
  } catch {
    return null;
  }
}

function rememberUpdateAttempt(latestBuildVersion: string) {
  try {
    window.sessionStorage.setItem(
      updateAttemptKey,
      JSON.stringify({
        currentBuildVersion: normalizeBuildId(currentBuildManifest()),
        latestBuildVersion,
        attemptedAt: Date.now(),
      }),
    );
  } catch {
    // The attempt marker is loop protection only; the button should still work if storage is blocked.
  }
}

function cleanupTemporaryStorageKeys() {
  try {
    temporaryStorageKeys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Diagnostics cleanup is best effort.
  }

  try {
    window.localStorage.removeItem("deepsignal:lastExploreError");
  } catch {
    // Do not touch local fallback, drafts, submitted answers, or inbox cache.
  }
}

function isDeepSignalCacheName(cacheName: string) {
  return cacheName.toLowerCase().includes("deepsignal");
}

async function getCacheNames() {
  if (typeof window === "undefined" || !("caches" in window)) {
    return [];
  }
  return window.caches.keys();
}

async function deleteDeepSignalCaches() {
  const cacheNamesBefore = await getCacheNames();
  const targets = cacheNamesBefore.filter(isDeepSignalCacheName);
  await Promise.all(targets.map((key) => window.caches.delete(key)));
  const cacheNamesAfter = await getCacheNames();
  return { cacheNamesBefore, cacheNamesAfter };
}

async function updateServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map(async (registration) => {
      await registration.update().catch(() => undefined);
      const waitingWorker = registration.waiting;
      if (waitingWorker) {
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
      }
    }),
  );
}

export async function updateDeepSignalToLatest(notice?: BuildUpdateNotice) {
  if (typeof window === "undefined") {
    return;
  }

  const latestBuild = notice?.latestBuild ?? (await fetchLatestBuildManifest().catch(() => null)) ?? currentBuildManifest();
  const latestBuildVersion = normalizeBuildId(latestBuild);
  const previousAttempt = readUpdateAttempt();
  const updateAttempted = previousAttempt?.latestBuildVersion === latestBuildVersion;
  rememberUpdateAttempt(latestBuildVersion);

  const initialDiagnostics: BuildUpdateDiagnostics = {
    currentBuildVersion: normalizeBuildId(currentBuildManifest()),
    latestBuildVersion,
    buildTime: normalizeBuildValue(latestBuild.buildTime),
    gitHash: normalizeBuildValue(latestBuild.gitHash),
    serviceWorkerControllerState: getServiceWorkerControllerState(),
    cacheNamesBefore: [],
    cacheNamesAfter: [],
    updateAttempted,
    updateSucceeded: false,
    mixedBuildAssetsDetected: Boolean(notice?.mixedBuildAssetsDetected),
    reason: notice?.reason,
    chunkFailure: notice?.chunkFailure,
  };
  publishDiagnostics(initialDiagnostics);

  cleanupTemporaryStorageKeys();
  await updateServiceWorkers().catch((error) => {
    console.warn("[DeepSignal update] service worker update failed", error);
  });
  const { cacheNamesBefore, cacheNamesAfter } = await deleteDeepSignalCaches().catch(() => ({
    cacheNamesBefore: [] as string[],
    cacheNamesAfter: [] as string[],
  }));

  publishDiagnostics({
    ...initialDiagnostics,
    serviceWorkerControllerState: getServiceWorkerControllerState(),
    cacheNamesBefore,
    cacheNamesAfter,
  });

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("v", normalizeBuildValue(latestBuild.appVersion));
  nextUrl.searchParams.set("t", String(Date.now()));
  window.location.replace(nextUrl.toString());
}

function logSuccessfulAttemptIfCurrentBuildMatches() {
  if (typeof window === "undefined") {
    return;
  }

  const attempt = readUpdateAttempt();
  if (!attempt?.latestBuildVersion) {
    return;
  }

  const currentBuildVersion = normalizeBuildId(currentBuildManifest());
  if (attempt.latestBuildVersion !== currentBuildVersion) {
    return;
  }

  publishDiagnostics({
    currentBuildVersion,
    latestBuildVersion: attempt.latestBuildVersion,
    buildTime: buildInfo.buildTime,
    gitHash: buildInfo.gitHash,
    serviceWorkerControllerState: getServiceWorkerControllerState(),
    cacheNamesBefore: [],
    cacheNamesAfter: [],
    updateAttempted: true,
    updateSucceeded: true,
    mixedBuildAssetsDetected: false,
  });

  try {
    window.sessionStorage.removeItem(updateAttemptKey);
  } catch {
    // Best effort only.
  }
}

export function startBuildUpdateCheck() {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  logSuccessfulAttemptIfCurrentBuildMatches();

  const controller = new AbortController();
  let timer: number | undefined;
  let attempts = 0;

  const scheduleNextCheck = (delayMs: number) => {
    if (controller.signal.aborted || attempts >= maxUpdateCheckAttempts) {
      return;
    }
    timer = window.setTimeout(runCheck, delayMs);
  };

  const runCheck = () => {
    attempts += 1;
    void (async () => {
      const manifest = await fetchLatestBuildManifest(controller.signal);
      if (!manifest) {
        scheduleNextCheck(updateCheckRetryMs);
        return;
      }

      if (sameBuild(manifest)) {
        scheduleNextCheck(updateCheckRetryMs);
        return;
      }

      if (!(await assetsReady(manifest, controller.signal))) {
        scheduleNextCheck(updateCheckRetryMs);
        return;
      }

      publishNotice(createNotice("latest_build_available", manifest));
      scheduleNextCheck(updateCheckRetryMs);
    })().catch((error) => {
      if (!controller.signal.aborted) {
        console.info("Build update check skipped.", error);
      }
      scheduleNextCheck(updateCheckRetryMs);
    });
  };

  scheduleNextCheck(updateCheckDelayMs);

  return () => {
    controller.abort();
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  };
}
