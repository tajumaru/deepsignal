import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "dist", "assets");
const assetFiles = existsSync(assetsDir) ? readdirSync(assetsDir) : [];

const deprecatedLegacyFiles = [
  "index-DFAMDvec.js",
  "index-BNI-ZcvE.js",
  "index-DAQjOAcM.js",
  "index-BhtEkMPU.js",
  "index-Ix1T3tGD.js",
  "index-CkIJSvaS.js",
  "index-Dpxlq_b.css",
  "index-Drxalu_b.css",
  "index-CZ6ocd24.css",
  "mysten-wallet-vymH5UZR.js",
];

const legacyEntryFiles = [
  "index-4tr9YFd4.js",
  "index-BwpMFmCw.js",
];

const legacyCssFiles = [
  "index-BEIwCWYP.css",
];

const legacyChunkFiles = [
  ["mysten-wallet-vBllroQ3.js", "mysten-wallet"],
];

mkdirSync(assetsDir, { recursive: true });

function findLatestAsset(prefix, extension) {
  const matches = assetFiles
    .filter((fileName) => fileName.startsWith(`${prefix}-`) && fileName.endsWith(extension))
    .sort();
  return matches.at(-1) ?? null;
}

const currentEntryFile = findLatestAsset("index", ".js") ?? "index.js";
const currentCssFile = findLatestAsset("index", ".css") ?? "index.css";

for (const fileName of deprecatedLegacyFiles) {
  const filePath = join(assetsDir, fileName);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

for (const fileName of legacyEntryFiles) {
  const filePath = join(assetsDir, fileName);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `import "./${currentEntryFile}";\n`, "utf8");
  }
}

for (const fileName of legacyCssFiles) {
  const filePath = join(assetsDir, fileName);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `@import "./${currentCssFile}";\n`, "utf8");
  }
}

for (const [fileName, targetPrefix] of legacyChunkFiles) {
  const targetFileName = findLatestAsset(targetPrefix, ".js");
  if (!targetFileName) {
    continue;
  }
  const filePath = join(assetsDir, fileName);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `export * from "./${targetFileName}";\nimport "./${targetFileName}";\n`, "utf8");
  }
}
