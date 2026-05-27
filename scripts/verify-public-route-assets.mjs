const origin = process.argv[2] || "https://deepsignal.wal.app";
const verifyToken = Date.now();

function absoluteAssetUrl(assetPath) {
  return new URL(assetPath.replace(/^\.\//, "./"), `${origin.replace(/\/$/, "")}/`).toString();
}

function isJavaScriptAsset(assetPath) {
  return assetPath.endsWith(".js");
}

async function fetchText(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}verify=${verifyToken}`, {
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

const manifestUrl = `${origin.replace(/\/$/, "")}/build.json`;
const manifestResponse = await fetchText(manifestUrl);
if (manifestResponse.status !== 200) {
  throw new Error(`build.json returned ${manifestResponse.status}: ${manifestResponse.body.slice(0, 120)}`);
}

const manifest = JSON.parse(manifestResponse.body);
const routeAssets = Object.values(manifest.routeAssets || {}).flat();
const jsAssets = [...new Set(routeAssets.filter((assetPath) => isJavaScriptAsset(assetPath)))].sort();

const failures = [];
console.log(`Verifying ${jsAssets.length} public route JS assets from ${origin}`);
console.log(`Build: v${manifest.appVersion || "unknown"} ${manifest.buildTime || "unknown"} ${manifest.gitHash || "unknown"}`);

for (const assetPath of jsAssets) {
  const url = absoluteAssetUrl(assetPath);
  try {
    const result = await fetchText(url);
    const prefix = result.body.slice(0, 80).replace(/\s+/g, " ");
    const isJsContent =
      result.contentType.includes("javascript") ||
      result.contentType.includes("ecmascript") ||
      result.contentType.includes("application/x-javascript");
    const bodyLooksWrong = /^<!doctype html/i.test(result.body) || /^<html/i.test(result.body) || result.body.includes("upstream connect error");
    const ok = result.status === 200 && isJsContent && !bodyLooksWrong;
    console.log(`${ok ? "OK " : "BAD"} ${result.status} ${result.contentType || "no-content-type"} ${assetPath} ${result.body.length} ${prefix}`);
    if (!ok) {
      failures.push({ assetPath, ...result, prefix });
    }
  } catch (error) {
    console.log(`BAD ERR ${assetPath} ${error?.message ?? String(error)}`);
    failures.push({ assetPath, status: "ERR", contentType: "", body: String(error) });
  }
}

if (failures.length > 0) {
  console.error(`Public asset verification failed for ${failures.length} assets.`);
  process.exit(1);
}

console.log("Public asset verification passed.");
