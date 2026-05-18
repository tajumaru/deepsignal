import { buildInfo } from "./buildInfo";

type BuildManifest = {
  appVersion?: string;
  buildTime?: string;
  gitHash?: string;
  assets?: string[];
};

const reloadStorageKey = "deepsignal.lastBuildReload";
const updateCheckDelayMs = 4500;
const updateCheckRetryMs = 30000;
const maxUpdateCheckAttempts = 20;
const assetCheckTimeoutMs = 7000;
const assetCheckLimit = 10;

function normalizeBuildId(manifest: BuildManifest) {
  return [manifest.appVersion, manifest.buildTime, manifest.gitHash].filter(Boolean).join("|");
}

function currentBuildId() {
  return [buildInfo.appVersion, buildInfo.buildTime, buildInfo.gitHash].filter(Boolean).join("|");
}

function sameBuild(manifest: BuildManifest) {
  const remoteBuildId = normalizeBuildId(manifest);
  return !remoteBuildId || remoteBuildId === currentBuildId();
}

function canReloadForBuild(buildId: string) {
  try {
    return window.sessionStorage.getItem(reloadStorageKey) !== buildId;
  } catch {
    return true;
  }
}

function rememberReloadForBuild(buildId: string) {
  try {
    window.sessionStorage.setItem(reloadStorageKey, buildId);
  } catch {
    // Reload protection is best effort; failing closed would leave old builds stuck.
  }
}

async function fetchWithTimeout(url: string, signal: AbortSignal) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), assetCheckTimeoutMs);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(url, {
      cache: "no-store",
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

export function startBuildUpdateCheck() {
  if (typeof window === "undefined") {
    return () => undefined;
  }

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
      const manifestUrl = new URL("./build.json", window.location.href);
      manifestUrl.searchParams.set("build-check", String(Date.now()));

      const response = await fetch(manifestUrl.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        scheduleNextCheck(updateCheckRetryMs);
        return;
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        scheduleNextCheck(updateCheckRetryMs);
        return;
      }

      const manifest = (await response.json()) as BuildManifest;
      if (sameBuild(manifest)) {
        scheduleNextCheck(updateCheckRetryMs);
        return;
      }

      const buildId = normalizeBuildId(manifest);
      if (!buildId || !canReloadForBuild(buildId)) {
        return;
      }

      if (!(await assetsReady(manifest, controller.signal))) {
        scheduleNextCheck(updateCheckRetryMs);
        return;
      }

      rememberReloadForBuild(buildId);
      window.location.reload();
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
