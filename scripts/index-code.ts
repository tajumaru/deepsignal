import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const srcDir = path.join(rootDir, "src");
const outputDir = path.join(rootDir, ".codex");
const outputPath = path.join(outputDir, "code-index.json");

const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".md"]);
const ignoredDirs = new Set(["node_modules", "dist", "build", ".git", "coverage", ".codex"]);

const domainTerms = [
  "create form",
  "signal inbox",
  "walrus",
  "seal",
  "sui",
  "upload relay",
  "uploadrelay",
  "anonymous",
  "anon",
  "conditional logic",
  "conditional required",
  "branching",
  "branch",
  "decrypt",
  "encrypt",
  "roadmap",
  "manifest",
  "restore",
  "project registry",
  "access control",
];

type CodeIndexEntry = {
  filePath: string;
  extension: string;
  imports: string[];
  exportedFunctions: string[];
  exportedConstants: string[];
  reactComponentCandidates: string[];
  hookCandidates: string[];
  keyTerms: string[];
  shortSummary: string;
};

type CodeIndexDocument = {
  version: 1;
  generatedAt: string;
  root: string;
  scope: string;
  files: CodeIndexEntry[];
};

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function splitIdentifierParts(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-./\\]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length >= 2);
}

function tokenizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 3);
}

function extractImports(content: string) {
  const imports = new Set<string>();
  const fromMatches = content.matchAll(/import[\s\S]*?from\s+["']([^"']+)["']/g);
  for (const match of fromMatches) {
    imports.add(match[1]);
  }
  const sideEffectMatches = content.matchAll(/import\s+["']([^"']+)["']/g);
  for (const match of sideEffectMatches) {
    imports.add(match[1]);
  }
  const requireMatches = content.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g);
  for (const match of requireMatches) {
    imports.add(match[1]);
  }
  return uniqueSorted(imports);
}

function extractExportedFunctions(content: string) {
  const names = new Set<string>();
  const functionMatches = content.matchAll(
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  );
  for (const match of functionMatches) {
    names.add(match[1]);
  }
  const constFunctionMatches = content.matchAll(
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
  );
  for (const match of constFunctionMatches) {
    names.add(match[1]);
  }
  return uniqueSorted(names);
}

function extractExportedConstants(content: string, exportedFunctions: string[]) {
  const functionNames = new Set(exportedFunctions);
  const names = new Set<string>();
  const constMatches = content.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\b/g);
  for (const match of constMatches) {
    if (!functionNames.has(match[1])) {
      names.add(match[1]);
    }
  }
  const namedExportMatches = content.matchAll(/export\s*\{\s*([^}]+)\s*\}/g);
  for (const match of namedExportMatches) {
    const members = match[1].split(",");
    for (const member of members) {
      const candidate = member.split(/\s+as\s+/i)[0]?.trim();
      if (candidate && /^[A-Za-z_$][\w$]*$/.test(candidate) && !functionNames.has(candidate)) {
        names.add(candidate);
      }
    }
  }
  return uniqueSorted(names);
}

function extractReactComponents(content: string, filePath: string, exportedFunctions: string[]) {
  const names = new Set<string>();
  if (!/\.(tsx|jsx)$/.test(filePath)) {
    return [];
  }

  const jsxSignals = /<([A-Z][A-Za-z0-9]*)\b|return\s*\(|return\s*</.test(content);
  const candidates = new Set<string>();

  for (const name of exportedFunctions) {
    if (/^[A-Z]/.test(name)) {
      candidates.add(name);
    }
  }

  const localMatches = content.matchAll(
    /(?:function|const)\s+([A-Z][A-Za-z0-9_$]*)\s*(?:\(|=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g,
  );
  for (const match of localMatches) {
    candidates.add(match[1]);
  }

  for (const candidate of candidates) {
    if (jsxSignals || content.includes(`${candidate}Props`) || content.includes(`<${candidate}`)) {
      names.add(candidate);
    }
  }

  return uniqueSorted(names);
}

function extractHooks(content: string) {
  const names = new Set<string>();
  const matches = content.matchAll(
    /(?:export\s+)?(?:async\s+)?function\s+(use[A-Z][A-Za-z0-9_$]*)\s*\(|(?:export\s+)?const\s+(use[A-Z][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
  );
  for (const match of matches) {
    const name = match[1] || match[2];
    if (name) {
      names.add(name);
    }
  }
  return uniqueSorted(names);
}

function extractKeyTerms(
  filePath: string,
  imports: string[],
  exportedFunctions: string[],
  exportedConstants: string[],
  reactComponents: string[],
  hooks: string[],
  content: string,
) {
  const terms = new Set<string>();

  for (const segment of splitIdentifierParts(filePath)) {
    terms.add(segment);
  }

  for (const identifier of [...imports, ...exportedFunctions, ...exportedConstants, ...reactComponents, ...hooks]) {
    terms.add(identifier);
    for (const segment of splitIdentifierParts(identifier)) {
      terms.add(segment);
    }
  }

  const lowerContent = content.toLowerCase();
  for (const term of domainTerms) {
    if (lowerContent.includes(term) || lowerContent.includes(term.replace(/\s+/g, ""))) {
      terms.add(term);
    }
  }

  for (const token of tokenizeText(content).slice(0, 120)) {
    if (
      token.includes("walrus") ||
      token.includes("seal") ||
      token.includes("sui") ||
      token.includes("signal") ||
      token.includes("form") ||
      token.includes("upload") ||
      token.includes("decrypt") ||
      token.includes("encrypt") ||
      token.includes("project") ||
      token.includes("admin") ||
      token.includes("anonymous") ||
      token.includes("condition")
    ) {
      terms.add(token);
    }
  }

  return uniqueSorted(terms);
}

function getShortSummary(
  filePath: string,
  imports: string[],
  exportedFunctions: string[],
  exportedConstants: string[],
  reactComponents: string[],
  hooks: string[],
  keyTerms: string[],
  content: string,
) {
  if (filePath.endsWith(".md")) {
    const heading = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith("#"));
    if (heading) {
      return heading.replace(/^#+\s*/, "").trim();
    }
  }

  const labels: string[] = [];
  if (filePath.includes("/pages/")) {
    labels.push("Page");
  } else if (filePath.includes("/components/")) {
    labels.push("Component");
  } else if (filePath.includes("/hooks/")) {
    labels.push("Hook");
  } else if (filePath.includes("/storage/")) {
    labels.push("Storage");
  } else if (filePath.includes("/crypto/")) {
    labels.push("Crypto");
  } else if (filePath.includes("/features/")) {
    labels.push("Feature");
  } else if (filePath.endsWith(".css")) {
    labels.push("Styles");
  } else {
    labels.push("Module");
  }

  const primaryNames = reactComponents.length
    ? reactComponents.slice(0, 2)
    : hooks.length
      ? hooks.slice(0, 2)
      : exportedFunctions.length
        ? exportedFunctions.slice(0, 2)
        : exportedConstants.slice(0, 2);

  if (primaryNames.length) {
    labels.push(primaryNames.join(", "));
  }

  const matchedDomains = keyTerms.filter((term) =>
    [
      "create form",
      "signal inbox",
      "walrus",
      "seal",
      "sui",
      "upload relay",
      "anonymous",
      "conditional logic",
      "decrypt",
      "roadmap",
      "manifest",
      "project registry",
      "access control",
    ].includes(term),
  );

  if (matchedDomains.length) {
    labels.push(`related to ${matchedDomains.slice(0, 3).join(", ")}`);
  } else if (imports.length) {
    labels.push(`imports ${imports.slice(0, 2).join(", ")}`);
  }

  return labels.join(" - ");
}

async function walk(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }

    if (allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

async function buildEntry(fullPath: string): Promise<CodeIndexEntry> {
  const content = await readFile(fullPath, "utf8");
  const filePath = toPosix(path.relative(rootDir, fullPath));
  const extension = path.extname(fullPath).toLowerCase();
  const imports = extractImports(content);
  const exportedFunctions = extractExportedFunctions(content);
  const exportedConstants = extractExportedConstants(content, exportedFunctions);
  const reactComponentCandidates = extractReactComponents(content, filePath, exportedFunctions);
  const hookCandidates = extractHooks(content);
  const keyTerms = extractKeyTerms(
    filePath,
    imports,
    exportedFunctions,
    exportedConstants,
    reactComponentCandidates,
    hookCandidates,
    content,
  );
  const shortSummary = getShortSummary(
    filePath,
    imports,
    exportedFunctions,
    exportedConstants,
    reactComponentCandidates,
    hookCandidates,
    keyTerms,
    content,
  );

  return {
    filePath,
    extension,
    imports,
    exportedFunctions,
    exportedConstants,
    reactComponentCandidates,
    hookCandidates,
    keyTerms,
    shortSummary,
  };
}

async function main() {
  const filePaths = await walk(srcDir);
  const files = await Promise.all(filePaths.sort((left, right) => left.localeCompare(right)).map(buildEntry));

  const document: CodeIndexDocument = {
    version: 1,
    generatedAt: new Date().toISOString(),
    root: toPosix(rootDir),
    scope: "src",
    files,
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  console.log(`Indexed ${files.length} files into ${toPosix(path.relative(rootDir, outputPath))}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
