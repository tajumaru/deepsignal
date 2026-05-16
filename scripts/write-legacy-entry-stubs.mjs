import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "dist", "assets");

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
  ["mysten-wallet-vBllroQ3.js", "mysten-wallet.js"],
];

mkdirSync(assetsDir, { recursive: true });

for (const fileName of deprecatedLegacyFiles) {
  const filePath = join(assetsDir, fileName);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

for (const fileName of legacyEntryFiles) {
  const filePath = join(assetsDir, fileName);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, 'import "./index.js";\n', "utf8");
  }
}

for (const fileName of legacyCssFiles) {
  const filePath = join(assetsDir, fileName);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, '@import "./index.css";\n', "utf8");
  }
}

for (const [fileName, targetFileName] of legacyChunkFiles) {
  const filePath = join(assetsDir, fileName);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `export * from "./${targetFileName}";\nimport "./${targetFileName}";\n`, "utf8");
  }
}
