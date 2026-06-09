import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(root, "src");
const publicRouteEntries = [
  "src/routes/PublicAppRoutes.tsx",
  "src/routes/publicRouteComponents.ts",
  "src/pages/PublicFormPage.tsx",
  "src/pages/PublicRoadmapPage.tsx",
  "src/pages/ManifestRestorePage.tsx",
];
const forbiddenSpecifiers = ["@mysten-incubation/memwal", "memwalSignalMemoryAdapter"];
const forbiddenSourceSegments = [`${normalize("src/memory")}`];
const forbiddenStaticPublicSpecifiers = [
  "@mysten/dapp-kit-react",
  "@mysten/dapp-kit-core",
  "@mysten/kiosk",
  "@mysten/seal",
  "@mysten/sui/",
  "@mysten/walrus",
];
const forbiddenStaticPublicSources = [
  normalize("src/components/WalletConnectSurface.tsx"),
  normalize("src/components/WalletNav.tsx"),
  normalize("src/pages/AdminDashboardPage.tsx"),
  normalize("src/pages/FormBuilderPage.tsx"),
];

function readSource(filePath: string) {
  return readFileSync(filePath, "utf8");
}

function localImportSpecifiers(source: string) {
  const specifiers = new Set<string>();
  const patterns = [
    /import(?:\s+type)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g,
    /export(?:\s+type)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function localStaticImportSpecifiers(source: string) {
  const specifiers = new Set<string>();
  const patterns = [
    /import(?!\s+type\b)[\s\S]*?\sfrom\s+["']([^"']+)["']/g,
    /export(?!\s+type\b)[\s\S]*?\sfrom\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function resolveLocalImport(fromFile: string, specifier: string) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const base = resolve(dirname(fromFile), specifier);
  const candidates = extname(base)
    ? [base]
    : [
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
      ];

  return candidates.find((candidate) => existsSync(candidate) && candidate.startsWith(srcRoot)) ?? null;
}

function collectPublicRouteImportGraph() {
  const seen = new Set<string>();
  const pending = publicRouteEntries.map((entry) => resolve(root, entry));

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);

    const source = readSource(filePath);
    for (const specifier of localImportSpecifiers(source)) {
      const resolved = resolveLocalImport(filePath, specifier);
      if (resolved && !seen.has(resolved)) {
        pending.push(resolved);
      }
    }
  }

  return [...seen].sort();
}

function collectPublicRouteStaticImportGraph() {
  const seen = new Set<string>();
  const pending = publicRouteEntries.map((entry) => resolve(root, entry));

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);

    const source = readSource(filePath);
    for (const specifier of localStaticImportSpecifiers(source)) {
      const resolved = resolveLocalImport(filePath, specifier);
      if (resolved && !seen.has(resolved)) {
        pending.push(resolved);
      }
    }
  }

  return [...seen].sort();
}

describe("public route MemWal isolation", () => {
  it("keeps the public bundle guard scoped to MemWal placeholders", () => {
    expect(forbiddenSpecifiers).toEqual(["@mysten-incubation/memwal", "memwalSignalMemoryAdapter"]);
    expect(forbiddenSourceSegments).toEqual([normalize("src/memory")]);
  });

  it("does not import MemWal package, placeholder adapter, or the memory adapter graph", () => {
    const graph = collectPublicRouteImportGraph();
    const violations: string[] = [];

    for (const filePath of graph) {
      const relativeFilePath = normalize(filePath.slice(root.length + 1));
      if (forbiddenSourceSegments.some((segment) => relativeFilePath.startsWith(segment))) {
        violations.push(`${relativeFilePath} is reachable from a public route`);
      }

      const source = readSource(filePath);
      for (const specifier of localImportSpecifiers(source)) {
        if (forbiddenSpecifiers.some((forbidden) => specifier.includes(forbidden))) {
          violations.push(`${relativeFilePath} imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps initial public route imports free of wallet and blockchain runtime packages", () => {
    const graph = collectPublicRouteStaticImportGraph();
    const violations: string[] = [];

    for (const filePath of graph) {
      const relativeFilePath = normalize(filePath.slice(root.length + 1));
      if (forbiddenStaticPublicSources.includes(relativeFilePath)) {
        violations.push(`${relativeFilePath} is statically reachable from a public route`);
      }

      const source = readSource(filePath);
      for (const specifier of localStaticImportSpecifiers(source)) {
        if (forbiddenStaticPublicSpecifiers.some((forbidden) => specifier.includes(forbidden))) {
          violations.push(`${relativeFilePath} statically imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
