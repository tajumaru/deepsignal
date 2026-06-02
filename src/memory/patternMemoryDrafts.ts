import type { DiagnosticsSummaryGroup, SystemDiagnostic } from "../diagnostics/types";
import { redactSystemSignal } from "../diagnostics/redaction";
import { getVisibleReviewerNotes } from "../lib/reviewCollaboration";
import type { Submission } from "../types";
import type {
  SignalKind,
  SignalPatternMemoryConfidence,
  SignalPatternMemoryDraft,
  SignalPatternMemoryType,
} from "./types";

type DiagnosticsSummaryDraftOptions = {
  groupBy?: "fingerprint" | "routeId" | "errorName" | "buildVersion";
  diagnostics?: SystemDiagnostic[];
  now?: string;
};

type SelectedSignalsDraftOptions = {
  now?: string;
  type?: SignalPatternMemoryType;
};

const SCHEMA_VERSION = "deepsignal.signal_pattern_memory.v1";
const UNKNOWN_TIME = "1970-01-01T00:00:00.000Z";
const MAX_TEXT_LENGTH = 220;
const MAX_ITEMS = 12;

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => sanitizeText(value ?? "")).filter(Boolean))].slice(0, MAX_ITEMS);
}

function sanitizeText(value: string) {
  return value
    .replace(/https?:\/\/[^\s)'"]+/g, (match) => stripQueryAndHash(match))
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b0x[a-f0-9]{32,}\b/gi, "[redacted-wallet]")
    .replace(/\b(session|signature|signed[-_]?bytes|wallet[-_]?signature|encrypted[-_]?payload|token|secret)[-_][A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/\b(session|signature|signed[-_]?bytes|wallet[-_]?signature|encrypted[-_]?payload|token|secret)\s*[:=]\s*[^\s,;)]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function stripQueryAndHash(value: string) {
  try {
    const url = new URL(value.trim());
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    const [withoutHash] = value.split("#");
    const [withoutQuery] = withoutHash.split("?");
    return withoutQuery || value;
  }
}

function isoOrFallback(value: string | undefined, fallback: string) {
  return value && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function confidenceFromCount(count: number): SignalPatternMemoryConfidence {
  if (count >= 5) {
    return "high";
  }
  if (count >= 2) {
    return "medium";
  }
  return "low";
}

function inferTypeFromSignals(submissions: Submission[]): SignalPatternMemoryType {
  if (submissions.length > 0 && submissions.every((submission) => redactSystemSignal(submission) !== null)) {
    return "system_diagnostic_pattern";
  }
  if (submissions.some((submission) => submission.category === "feature")) {
    return "product_request_pattern";
  }
  if (submissions.some((submission) => submission.category === "bug")) {
    return "ux_friction_pattern";
  }
  return "user_feedback_pattern";
}

function inferSignalKinds(submissions: Submission[]): SignalKind[] {
  const kinds = submissions.map<SignalKind>((submission) =>
    redactSystemSignal(submission) ? "system_signal" : "user_signal",
  );
  return [...new Set(kinds)];
}

function buildRecommendedCodexPrompt(title: string, evidence: string[]) {
  const safeEvidence = evidence.slice(0, 3).join(" ");
  return sanitizeText(`Investigate DeepSignal pattern "${title}". Use only redacted evidence: ${safeEvidence}`);
}

export function createDraftFromDiagnosticsSummaryGroup(
  group: DiagnosticsSummaryGroup,
  options: DiagnosticsSummaryDraftOptions = {},
): SignalPatternMemoryDraft {
  const diagnostics = options.diagnostics ?? [];
  const groupBy = options.groupBy ?? "fingerprint";
  const relatedDiagnostics = diagnostics.filter((diagnostic) => String(diagnostic[groupBy] || "unknown") === group.key);
  const affectedRoutes = unique([
    ...relatedDiagnostics.map((diagnostic) => diagnostic.routeId),
    ...relatedDiagnostics.map((diagnostic) => diagnostic.routePath),
  ]);
  const affectedBuilds = unique(relatedDiagnostics.map((diagnostic) => diagnostic.buildVersion));
  const platforms = unique(relatedDiagnostics.map((diagnostic) => diagnostic.platform));
  const fingerprints = groupBy === "fingerprint"
    ? unique([group.key])
    : unique(relatedDiagnostics.map((diagnostic) => diagnostic.fingerprint));
  const firstSeen = isoOrFallback(group.firstSeen, options.now ?? UNKNOWN_TIME);
  const lastSeen = isoOrFallback(group.lastSeen, firstSeen);
  const title = sanitizeText(`Repeated ${groupBy} ${group.key}`);
  const evidenceSummary = [
    `${group.count} redacted diagnostics share ${groupBy} ${group.key}.`,
    `Maximum severity is ${group.severityMax}.`,
    affectedRoutes.length > 0 ? `Affected routes include ${affectedRoutes.slice(0, 3).join(", ")}.` : "",
    affectedBuilds.length > 0 ? `Affected builds include ${affectedBuilds.slice(0, 3).join(", ")}.` : "",
  ].map(sanitizeText).filter(Boolean);

  return {
    schemaVersion: SCHEMA_VERSION,
    type: "system_diagnostic_pattern",
    title,
    summary: sanitizeText(`System diagnostics show a recurring ${groupBy} pattern across ${group.count} captured runtime signals.`),
    signalKinds: ["diagnostics_summary_group", "system_signal"],
    sourceSignalIds: unique(group.examples),
    fingerprints,
    tags: unique(["system", "diagnostics", group.severityMax, groupBy, group.key]),
    affectedRoutes,
    affectedBuilds,
    platforms,
    frequency: {
      count: group.count,
      window: "all_time",
      trend: group.count > 1 ? "stable" : "new",
    },
    firstSeen,
    lastSeen,
    status: "draft",
    confidence: confidenceFromCount(group.count),
    evidenceSummary,
    recommendedAction: sanitizeText("Review the affected route/build cluster, confirm current reproducibility, and link any confirmed fix back to this pattern."),
    recommendedCodexPrompt: buildRecommendedCodexPrompt(title, evidenceSummary),
    failedFixes: [],
    confirmedFixes: [],
  };
}

export function createDraftFromSelectedSignals(
  submissions: Submission[],
  options: SelectedSignalsDraftOptions = {},
): SignalPatternMemoryDraft {
  const safeSubmissions = submissions.slice(0, MAX_ITEMS);
  const systemDiagnostics = safeSubmissions
    .map((submission) => redactSystemSignal(submission, { includeStackTraces: false }))
    .filter((diagnostic): diagnostic is SystemDiagnostic => diagnostic !== null);
  const type = options.type ?? inferTypeFromSignals(safeSubmissions);
  const firstSeen = safeSubmissions.reduce<string | undefined>(
    (earliest, submission) => !earliest || submission.createdAt < earliest ? submission.createdAt : earliest,
    undefined,
  );
  const lastSeen = safeSubmissions.reduce<string | undefined>(
    (latest, submission) => !latest || submission.createdAt > latest ? submission.createdAt : latest,
    undefined,
  );
  const safeSummaries = unique(
    safeSubmissions.map((submission) => {
      const diagnostic = systemDiagnostics.find((item) => item.id === submission.id);
      return diagnostic?.errorMessage ?? submission.aiSummary ?? getVisibleReviewerNotes(submission);
    }),
  );
  const safeCategories = unique(safeSubmissions.map((submission) => submission.category));
  const safeTags = unique(safeSubmissions.flatMap((submission) => submission.tags));
  const titleSeed = safeTags[0] ?? safeCategories[0] ?? (type === "system_diagnostic_pattern" ? "system diagnostics" : "selected signals");
  const title = sanitizeText(`${safeSubmissions.length} signal pattern: ${titleSeed}`);
  const affectedRoutes = unique(systemDiagnostics.flatMap((diagnostic) => [diagnostic.routeId, diagnostic.routePath]));
  const affectedBuilds = unique(systemDiagnostics.map((diagnostic) => diagnostic.buildVersion));
  const platforms = unique(systemDiagnostics.map((diagnostic) => diagnostic.platform));
  const fingerprints = unique(systemDiagnostics.map((diagnostic) => diagnostic.fingerprint));
  const evidenceSummary = [
    `${safeSubmissions.length} selected signals were summarized into a redacted pattern draft.`,
    safeCategories.length > 0 ? `Categories include ${safeCategories.join(", ")}.` : "",
    safeTags.length > 0 ? `Tags include ${safeTags.slice(0, 5).join(", ")}.` : "",
    ...safeSummaries.slice(0, 4),
  ].map(sanitizeText).filter(Boolean);

  return {
    schemaVersion: SCHEMA_VERSION,
    type,
    title,
    summary: sanitizeText(
      safeSummaries[0] ??
        `Selected signals suggest a recurring ${type.replace(/_/g, " ")} that should be reviewed before saving as memory.`,
    ),
    signalKinds: inferSignalKinds(safeSubmissions),
    sourceSignalIds: unique(safeSubmissions.map((submission) => submission.id)),
    fingerprints,
    tags: unique([...safeTags, ...safeCategories, type]),
    affectedRoutes,
    affectedBuilds,
    platforms,
    frequency: {
      count: safeSubmissions.length,
      window: "all_time",
      trend: safeSubmissions.length > 1 ? "stable" : "new",
    },
    firstSeen: isoOrFallback(firstSeen, options.now ?? UNKNOWN_TIME),
    lastSeen: isoOrFallback(lastSeen, firstSeen ?? options.now ?? UNKNOWN_TIME),
    status: "draft",
    confidence: confidenceFromCount(safeSubmissions.length),
    evidenceSummary,
    recommendedAction: sanitizeText("Review the redacted evidence, merge with any existing memory if duplicated, and decide whether this pattern is active or stale."),
    recommendedCodexPrompt: buildRecommendedCodexPrompt(title, evidenceSummary),
    failedFixes: [],
    confirmedFixes: [],
  };
}
