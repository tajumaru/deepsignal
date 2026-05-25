export type PublicRouteAssetKey = "publicForm" | "publicRoadmap" | "manifestRestore";

type BuildManifest = {
  appVersion?: string;
  buildTime?: string;
  gitHash?: string;
  assets?: string[];
  routeAssets?: Partial<Record<PublicRouteAssetKey, string[]>>;
};

export type PublicAssetProbeAttempt = {
  status: number;
  ok: boolean;
  contentType: string;
  url: string;
  errorMessage?: string;
};

export type PublicAssetProbe = {
  path: string;
  url: string;
  status: number;
  ok: boolean;
  contentType: string;
  expectedType: "js" | "css" | "other";
  attempts: PublicAssetProbeAttempt[];
  errorMessage?: string;
};

export type PublicRouteAssetVerification = {
  ok: boolean;
  assets: PublicAssetProbe[];
  failedAsset: PublicAssetProbe | null;
  appVersion?: string;
  buildTime?: string;
  gitHash?: string;
  checkedAt: string;
};

type BuildManifestCacheEntry = {
  createdAt: number;
  promise: Promise<BuildManifest>;
};

const buildManifestCache = new Map<string, BuildManifestCacheEntry>();
const buildManifestCacheTtlMs = 15_000;
const assetProbeConcurrency = 3;
const assetProbeAttempts = 8;
const assetProbeBaseDelayMs = 900;

function getBaseOrigin(origin?: string) {
  return origin ?? (typeof window === "undefined" ? "" : window.location.origin);
}

function getBuildManifestUrl(origin?: string) {
  const manifestUrl = new URL("./build.json", `${getBaseOrigin(origin) || "http://localhost"}/`);
  manifestUrl.searchParams.set("public-asset-check", String(Date.now()));
  return manifestUrl.toString();
}

function getExpectedAssetType(assetPath: string): PublicAssetProbe["expectedType"] {
  if (assetPath.endsWith(".js")) {
    return "js";
  }
  if (assetPath.endsWith(".css")) {
    return "css";
  }
  return "other";
}

function isExpectedMimeType(expectedType: PublicAssetProbe["expectedType"], contentType: string) {
  if (expectedType === "js") {
    return /javascript|ecmascript/i.test(contentType);
  }
  if (expectedType === "css") {
    return /text\/css/i.test(contentType);
  }
  return true;
}

function isRetryableStatus(status: number) {
  return status === 0 || status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getProbeDelay(attempt: number) {
  return assetProbeBaseDelayMs * attempt;
}

function wait(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  mapper: (item: TInput) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function readPublicBuildManifest(origin?: string): Promise<BuildManifest> {
  const baseOrigin = getBaseOrigin(origin);
  const cacheKey = baseOrigin || "window";
  const cached = buildManifestCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < buildManifestCacheTtlMs) {
    return cached.promise;
  }

  const manifestPromise = (async () => {
    const response = await fetch(getBuildManifestUrl(baseOrigin), {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Build manifest fetch failed with status ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Build manifest returned invalid content type: ${contentType || "unknown"}.`);
    }
    return (await response.json()) as BuildManifest;
  })();

  buildManifestCache.set(cacheKey, { createdAt: Date.now(), promise: manifestPromise });
  return manifestPromise;
}

export async function probePublicAsset(assetPath: string, origin?: string): Promise<PublicAssetProbe> {
  const baseOrigin = getBaseOrigin(origin);
  const expectedType = getExpectedAssetType(assetPath);
  const attempts: PublicAssetProbeAttempt[] = [];

  for (let attempt = 1; attempt <= assetProbeAttempts; attempt += 1) {
    const assetUrl = new URL(assetPath, `${baseOrigin || "http://localhost"}/`);
    assetUrl.searchParams.set("public-asset-check", `${Date.now()}-${attempt}`);
    try {
      const response = await fetch(assetUrl.toString(), {
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") || "";
      const ok = response.ok && isExpectedMimeType(expectedType, contentType);
      const probeAttempt = {
        path: assetPath,
        url: assetUrl.toString(),
        status: response.status,
        ok,
        contentType,
        expectedType,
      };
      attempts.push({
        status: response.status,
        ok,
        contentType,
        url: assetUrl.toString(),
      });
      if (ok || !isRetryableStatus(response.status) || attempt === assetProbeAttempts) {
        return { ...probeAttempt, attempts: [...attempts] };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Asset probe failed.";
      attempts.push({
        status: 0,
        ok: false,
        contentType: "",
        url: assetUrl.toString(),
        errorMessage,
      });
      if (attempt === assetProbeAttempts) {
        return {
          path: assetPath,
          url: assetUrl.toString(),
          status: 0,
          ok: false,
          contentType: "",
          expectedType,
          attempts: [...attempts],
          errorMessage,
        };
      }
    }

    await wait(getProbeDelay(attempt));
  }

  const lastAttempt = attempts[attempts.length - 1];
  return {
    path: assetPath,
    url: lastAttempt?.url ?? new URL(assetPath, `${baseOrigin || "http://localhost"}/`).toString(),
    status: lastAttempt?.status ?? 0,
    ok: false,
    contentType: lastAttempt?.contentType ?? "",
    expectedType,
    attempts,
    errorMessage: lastAttempt?.errorMessage,
  };
}

export async function verifyPublicRouteAssets(
  routeKey: PublicRouteAssetKey,
  origin?: string,
): Promise<PublicRouteAssetVerification> {
  const manifest = await readPublicBuildManifest(origin);
  const assetPaths = [...new Set((manifest.routeAssets?.[routeKey] ?? manifest.assets ?? []).filter(Boolean))];
  if (assetPaths.length === 0) {
    throw new Error(`Build manifest does not include any assets for ${routeKey}.`);
  }

  const assets = await mapWithConcurrency(assetPaths, assetProbeConcurrency, (assetPath) => probePublicAsset(assetPath, origin));
  const failedAsset = assets.find((asset) => !asset.ok) ?? null;
  return {
    ok: !failedAsset,
    assets,
    failedAsset,
    appVersion: manifest.appVersion,
    buildTime: manifest.buildTime,
    gitHash: manifest.gitHash,
    checkedAt: new Date().toISOString(),
  };
}
