import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] || "dist");
const assetsDir = join(root, "assets");
const maxDependencyAssets = 800;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function normalizeAssetPath(assetPath) {
  return assetPath.replace(/^\.\//, "").replace(/\//g, sep);
}

function isInsideDist(path) {
  const normalizedRoot = `${normalize(root)}${sep}`;
  return normalize(path).startsWith(normalizedRoot);
}

function resolveAssetPath(fromFile, reference) {
  const resolved = resolve(dirname(fromFile), reference.split("?")[0]);
  if (!isInsideDist(resolved)) {
    return null;
  }
  return resolved;
}

function extractChunkDependencyPaths(filePath, source) {
  const dependencies = new Set();
  const quotedAssetPattern = /["'](\.\/[^"']+\.(?:js|css|wasm)(?:\?[^"']*)?)["']/g;
  for (const match of source.matchAll(quotedAssetPattern)) {
    const resolved = resolveAssetPath(filePath, match[1]);
    if (resolved) {
      dependencies.add(resolved);
    }
  }
  return [...dependencies];
}

function readManifestAssetSeeds() {
  const manifestPath = join(root, "build.json");
  if (!existsSync(manifestPath)) {
    fail(`Missing ${manifestPath}`);
    return [];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const indexHtmlPath = join(root, "index.html");
  const indexHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, "utf8") : "";
  const indexAssets = [...indexHtml.matchAll(/\b(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map((match) =>
    match[1].startsWith("/") ? `.${match[1]}` : match[1],
  );
  return [
    ...(manifest.assets || []),
    ...Object.values(manifest.routeAssets || {}).flat(),
    ...indexAssets,
  ].filter((assetPath) => assetPath.endsWith(".js") || assetPath.endsWith(".css"));
}

if (!existsSync(assetsDir)) {
  fail(`Missing ${assetsDir}`);
  process.exit(process.exitCode || 1);
}

const seeds = [...new Set(readManifestAssetSeeds())];
const pending = seeds.map((assetPath) => join(root, normalizeAssetPath(assetPath)));
const inspected = new Set();
const missing = [];

while (pending.length > 0 && inspected.size < maxDependencyAssets) {
  const filePath = pending.shift();
  if (!filePath || inspected.has(filePath)) {
    continue;
  }
  inspected.add(filePath);

  if (!existsSync(filePath)) {
    missing.push(filePath);
    continue;
  }

  if (!filePath.endsWith(".js")) {
    continue;
  }

  const source = readFileSync(filePath, "utf8");
  for (const dependency of extractChunkDependencyPaths(filePath, source)) {
    if (!inspected.has(dependency)) {
      pending.push(dependency);
    }
  }
}

if (inspected.size >= maxDependencyAssets) {
  fail(`Stopped after ${maxDependencyAssets} emitted assets; dependency graph may contain an unexpected loop.`);
}

if (missing.length > 0) {
  for (const filePath of missing) {
    console.error(`MISSING ${filePath}`);
  }
  fail(`Dist chunk dependency verification failed for ${missing.length} missing assets.`);
} else {
  console.log(`Dist chunk dependency verification passed. Traversed ${inspected.size} emitted assets from ${seeds.length} seeds.`);
  const routeChunks = [...inspected].filter((filePath) => /(?:AdminDashboardPage|FormBuilderPage)-[\w-]+\.js$/.test(basename(filePath)));
  for (const routeChunk of routeChunks) {
    console.log(`ROUTE ${basename(routeChunk)}`);
  }
}
