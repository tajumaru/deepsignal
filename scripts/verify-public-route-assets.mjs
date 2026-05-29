const origin = process.argv[2] || "https://deepsignal.wal.app";
const verifyToken = Date.now();

function absoluteAssetUrl(assetPath) {
  return new URL(assetPath.replace(/^\.\//, "./"), `${origin.replace(/\/$/, "")}/`).toString();
}

function isJavaScriptAsset(assetPath) {
  return assetPath.endsWith(".js");
}

function isJavaScriptLikeContent(contentType) {
  return (
    contentType.includes("javascript") ||
    contentType.includes("ecmascript") ||
    contentType.includes("application/x-javascript")
  );
}

function bodyLooksWrong(body) {
  const prefix = body.slice(0, 240).replace(/\s+/g, " ");
  return (
    /^<!doctype html/i.test(prefix) ||
    /^<html/i.test(prefix) ||
    /upstream connect error|service unavailable|reset before headers/i.test(prefix)
  );
}

function extractIndexAssetPaths(html) {
  const paths = new Set();
  const attributePattern = /\b(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/g;
  for (const match of html.matchAll(attributePattern)) {
    const value = match[1];
    if (/^(?:https?:)?\/\//i.test(value)) {
      try {
        const url = new URL(value, origin);
        if (url.origin === new URL(origin).origin) {
          paths.add(`.${url.pathname}`);
        }
      } catch {
        // Ignore malformed URLs; the fetch check below is for concrete assets.
      }
      continue;
    }
    paths.add(value.startsWith("/") ? `.${value}` : value);
  }
  return [...paths];
}

function extractChunkDependencyUrls(url, source) {
  const urls = new Set();
  const quotedAssetPattern = /["'](\.\/[^"']+\.(?:js|css|wasm)(?:\?[^"']*)?)["']/g;
  for (const match of source.matchAll(quotedAssetPattern)) {
    try {
      urls.add(new URL(match[1], url).toString());
    } catch {
      // Ignore malformed emitted references; concrete fetch failures are reported below.
    }
  }
  return [...urls];
}

function assetPathFromUrl(url) {
  const parsed = new URL(url);
  return `.${parsed.pathname}`;
}

async function fetchText(url, options = {}) {
  const targetUrl = options.cacheBust ? `${url}${url.includes("?") ? "&" : "?"}verify=${verifyToken}` : url;
  const response = await fetch(targetUrl, {
    headers: {
      "cache-control": "no-cache",
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    },
  });
  const body = await response.text();
  return {
    body,
    contentType: response.headers.get("content-type") || "",
    status: response.status,
  };
}

async function fetchAssetWithRetry(url, attempts = 3) {
  const results = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await fetchText(url);
    results.push(result);
    const prefix = result.body.slice(0, 160).replace(/\s+/g, " ");
    const isJsContent = isJavaScriptLikeContent(result.contentType);
    if (result.status === 200 && isJsContent && !bodyLooksWrong(result.body) && result.body.length > 0) {
      return { result, attempts: results };
    }
    await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
  }
  return { result: results.at(-1), attempts: results };
}

const manifestUrl = `${origin.replace(/\/$/, "")}/build.json`;
const manifestResponse = await fetchText(manifestUrl, { cacheBust: true });
if (manifestResponse.status !== 200) {
  throw new Error(`build.json returned ${manifestResponse.status}: ${manifestResponse.body.slice(0, 120)}`);
}

const manifest = JSON.parse(manifestResponse.body);
const indexResponse = await fetchText(`${origin.replace(/\/$/, "")}/`, { cacheBust: true });
if (indexResponse.status !== 200 || /^<!doctype html/i.test(indexResponse.body) === false) {
  throw new Error(`index.html returned ${indexResponse.status}: ${indexResponse.body.slice(0, 120)}`);
}
const routeAssets = Object.values(manifest.routeAssets || {}).flat();
const indexAssets = extractIndexAssetPaths(indexResponse.body);
const seedJsAssets = [...new Set([...routeAssets, ...(manifest.assets || []), ...indexAssets].filter((assetPath) => isJavaScriptAsset(assetPath)))].sort();
const jsAssets = new Set(seedJsAssets);
const pendingUrls = seedJsAssets.map((assetPath) => absoluteAssetUrl(assetPath));
const inspectedUrls = new Set();
const maxDependencyAssets = 500;

const failures = [];
console.log(`Verifying ${seedJsAssets.length} public route JS assets from ${origin}`);
console.log(`Build: v${manifest.appVersion || "unknown"} ${manifest.buildTime || "unknown"} ${manifest.gitHash || "unknown"}`);

while (pendingUrls.length > 0 && inspectedUrls.size < maxDependencyAssets) {
  const url = pendingUrls.shift();
  if (!url || inspectedUrls.has(url)) {
    continue;
  }
  inspectedUrls.add(url);
  const assetPath = assetPathFromUrl(url);
  jsAssets.add(assetPath);
  try {
    const { result, attempts } = await fetchAssetWithRetry(url);
    const prefix = result.body.slice(0, 80).replace(/\s+/g, " ");
    const isJsContent = isJavaScriptLikeContent(result.contentType);
    const wrongBody = bodyLooksWrong(result.body);
    const ok = result.status === 200 && isJsContent && !wrongBody && result.body.length > 0;
    const retryNote = attempts.length > 1 ? ` after ${attempts.length} attempts` : "";
    console.log(`${ok ? "OK " : "BAD"} ${result.status} ${result.contentType || "no-content-type"} ${assetPath} ${result.body.length}${retryNote} ${prefix}`);
    if (!ok) {
      failures.push({ assetPath, ...result, prefix });
      continue;
    }

    for (const dependencyUrl of extractChunkDependencyUrls(url, result.body)) {
      if (new URL(dependencyUrl).origin !== new URL(origin).origin) {
        continue;
      }
      const dependencyPath = assetPathFromUrl(dependencyUrl);
      if (dependencyPath.endsWith(".js") && !inspectedUrls.has(dependencyUrl)) {
        pendingUrls.push(dependencyUrl);
      }
    }
  } catch (error) {
    console.log(`BAD ERR ${assetPath} ${error?.message ?? String(error)}`);
    failures.push({ assetPath, status: "ERR", contentType: "", body: String(error) });
  }
}

if (inspectedUrls.size >= maxDependencyAssets) {
  failures.push({
    assetPath: "dependency traversal",
    status: "LIMIT",
    contentType: "",
    body: `Stopped after ${maxDependencyAssets} assets.`,
  });
}

if (failures.length > 0) {
  console.error(`Public asset verification failed for ${failures.length} assets.`);
  process.exit(1);
}

console.log(`Public asset verification passed. Traversed ${jsAssets.size} JS assets including nested dependencies.`);
