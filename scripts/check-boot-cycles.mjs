import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const workspaceRoot = process.cwd();
const srcRoot = path.resolve(workspaceRoot, "src");
const sourceExtensions = new Set([".ts", ".tsx"]);

const bootCriticalModules = [
  "src/main.tsx",
  "src/App.tsx",
  "src/AppRoot.tsx",
  "src/providers.tsx",
  "src/i18n.tsx",
  "src/walletSession.tsx",
  "src/walletSessionState.ts",
  "src/rpcInfrastructure.tsx",
  "src/RpcInfrastructureProvider.tsx",
  "src/routes/AppRoutes.tsx",
  "src/routes/PublicAppRoutes.tsx",
  "src/routes/appRouteComponents.ts",
  "src/routes/publicRouteComponents.ts",
  "src/routes/routeDiagnostics.ts",
  "src/components/AppShell.tsx",
  "src/components/WalletSurface.tsx",
  "src/components/WalletSurfaceRuntime.ts",
  "src/lib/buildAssetDiagnostics.ts",
  "src/lib/buildUpdate.ts",
  "src/lib/chunkLoadRecovery.ts",
  "src/lib/dashboardProjectRestore.ts",
  "src/lib/lazyRetry.ts",
  "src/lib/projectRegistry.ts",
  "src/lib/routeDiagnostics.ts",
  "src/services/systemSignalReporter.ts",
].map((file) => path.resolve(workspaceRoot, file));

function walkDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDirectory(fullPath));
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(path.normalize(fullPath));
    }
  }
  return files;
}

function resolveRelativeModule(fromFile, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && sourceExtensions.has(path.extname(candidate))) {
      return path.normalize(candidate);
    }
  }
  return null;
}

function readDependencies(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const dependencies = [];

  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
        return;
      }
      if (node.importClause?.isTypeOnly) {
        return;
      }
      const resolved = resolveRelativeModule(filePath, node.moduleSpecifier.text);
      if (resolved) {
        dependencies.push(resolved);
      }
      return;
    }

    if (ts.isExportDeclaration(node)) {
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier) || node.isTypeOnly) {
        return;
      }
      const resolved = resolveRelativeModule(filePath, node.moduleSpecifier.text);
      if (resolved) {
        dependencies.push(resolved);
      }
    }
  });

  return dependencies;
}

function canonicalizeCycle(cycle) {
  const relativeCycle = cycle.map((filePath) => path.relative(workspaceRoot, filePath));
  const closedCycle = relativeCycle.slice(0, -1);
  let best = null;
  for (let index = 0; index < closedCycle.length; index += 1) {
    const rotated = closedCycle.slice(index).concat(closedCycle.slice(0, index));
    const key = rotated.join(" -> ");
    if (!best || key < best) {
      best = key;
    }
  }
  return best;
}

function findCycles(graph, targets) {
  const cycles = [];
  const seen = new Set();
  const stack = [];
  const visiting = new Set();

  function dfs(node) {
    visiting.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) {
      const stackIndex = stack.indexOf(dependency);
      if (stackIndex !== -1) {
        const cycle = stack.slice(stackIndex).concat(dependency);
        const key = canonicalizeCycle(cycle);
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
        continue;
      }
      if (!visiting.has(dependency)) {
        dfs(dependency);
      }
    }
    stack.pop();
    visiting.delete(node);
  }

  for (const target of targets) {
    if (graph.has(target)) {
      dfs(target);
    }
  }
  return cycles;
}

const sourceFiles = walkDirectory(srcRoot);
const dependencyGraph = new Map(sourceFiles.map((filePath) => [filePath, readDependencies(filePath)]));
const cycles = findCycles(dependencyGraph, bootCriticalModules).filter((cycle) =>
  cycle.some((filePath) => bootCriticalModules.includes(filePath)),
);

if (cycles.length > 0) {
  console.error("Boot/runtime module cycles detected:");
  for (const cycle of cycles) {
    const printable = cycle.map((filePath) => path.relative(workspaceRoot, filePath));
    console.error(`- ${printable.join(" -> ")}`);
  }
  process.exit(1);
}

console.log("No boot/runtime module cycles detected.");
