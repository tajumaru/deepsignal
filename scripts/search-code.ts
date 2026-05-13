import { readFile } from "node:fs/promises";
import path from "node:path";

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
  version: number;
  generatedAt: string;
  root: string;
  scope: string;
  files: CodeIndexEntry[];
};

type SearchResult = {
  entry: CodeIndexEntry;
  score: number;
  reasons: string[];
};

const indexPath = path.join(process.cwd(), ".codex", "code-index.json");

function tokenizeQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 2);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function scoreText(text: string, terms: string[], weight: number) {
  const lower = text.toLowerCase();
  let score = 0;
  const matched: string[] = [];
  for (const term of terms) {
    if (lower.includes(term)) {
      score += weight;
      matched.push(term);
    }
  }
  return { score, matched: unique(matched) };
}

function scoreEntry(entry: CodeIndexEntry, terms: string[], phrase: string): SearchResult | null {
  const reasons: string[] = [];
  let score = 0;

  const pathMatch = scoreText(entry.filePath, terms, 18);
  if (pathMatch.score > 0) {
    score += pathMatch.score;
    reasons.push(`path matches ${pathMatch.matched.join(", ")}`);
  }

  const summaryMatch = scoreText(entry.shortSummary, terms, 10);
  if (summaryMatch.score > 0) {
    score += summaryMatch.score;
    reasons.push(`summary mentions ${summaryMatch.matched.join(", ")}`);
  }

  const keyTermMatch = scoreText(entry.keyTerms.join(" "), terms, 12);
  if (keyTermMatch.score > 0) {
    score += keyTermMatch.score;
    reasons.push(`key terms include ${keyTermMatch.matched.join(", ")}`);
  }

  const exportMatch = scoreText(
    [
      ...entry.exportedFunctions,
      ...entry.exportedConstants,
      ...entry.reactComponentCandidates,
      ...entry.hookCandidates,
    ].join(" "),
    terms,
    14,
  );
  if (exportMatch.score > 0) {
    score += exportMatch.score;
    reasons.push(`exports/components/hooks match ${exportMatch.matched.join(", ")}`);
  }

  const importMatch = scoreText(entry.imports.join(" "), terms, 6);
  if (importMatch.score > 0) {
    score += importMatch.score;
    reasons.push(`imports reference ${importMatch.matched.join(", ")}`);
  }

  if (phrase && entry.filePath.toLowerCase().includes(phrase)) {
    score += 20;
    reasons.push(`path includes phrase "${phrase}"`);
  }

  if (phrase && entry.shortSummary.toLowerCase().includes(phrase)) {
    score += 14;
    reasons.push(`summary includes phrase "${phrase}"`);
  }

  if (terms.length > 0 && terms.every((term) => entry.keyTerms.join(" ").toLowerCase().includes(term))) {
    score += 16;
    reasons.push("all search terms are covered by key terms");
  }

  if (score <= 0) {
    return null;
  }

  return {
    entry,
    score,
    reasons: unique(reasons),
  };
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error("Usage: npm run code:search -- <keywords>");
    process.exitCode = 1;
    return;
  }

  const raw = await readFile(indexPath, "utf8");
  const document = JSON.parse(raw) as CodeIndexDocument;
  const terms = unique(tokenizeQuery(query));
  const phrase = query.toLowerCase();

  const results = document.files
    .map((entry) => scoreEntry(entry, terms, phrase))
    .filter((result): result is SearchResult => result !== null)
    .sort((left, right) => right.score - left.score || left.entry.filePath.localeCompare(right.entry.filePath))
    .slice(0, 12);

  console.log(`Query: ${query}`);
  console.log(`Index: ${path.relative(process.cwd(), indexPath)}`);
  console.log(`Files scanned: ${document.files.length}`);

  if (!results.length) {
    console.log("No matches found.");
    return;
  }

  console.log("");
  for (const result of results) {
    console.log(`[score ${result.score}] ${result.entry.filePath}`);
    console.log(`  summary: ${result.entry.shortSummary}`);
    console.log(`  reason: ${result.reasons.join("; ")}`);
    console.log("");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
