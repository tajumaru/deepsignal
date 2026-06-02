import { redactSystemSignal } from "../diagnostics/redaction";
import { getVisibleReviewerNotes } from "../lib/reviewCollaboration";
import type { SignalRecord } from "../features/admin/hooks/useSignalInboxData";
import type { Submission } from "../types";
import type { SignalPatternMemory, SignalPatternMemoryType } from "./types";

export type SafeSignalProfile = {
  submissionId: string;
  formId: string;
  projectId?: string;
  category: string;
  tags: string[];
  priority: Submission["priority"];
  triageStatus: Submission["triageStatus"];
  status: Submission["status"];
  aiSummary?: string;
  subjectPreview?: string;
  adminNotes?: string;
  formTitle: string;
  fieldLabels: string[];
  system?: {
    fingerprint?: string;
    routeId?: string;
    routePath?: string;
    buildVersion?: string;
  };
};

export type RelatedPatternMemoryReason =
  | "source_signal"
  | "fingerprint"
  | "route"
  | "build"
  | "shared_tags"
  | "same_category"
  | "similar_summary"
  | "same_form"
  | "same_project"
  | "same_priority"
  | "triage_relevant"
  | "active_recurring";

export type RelatedPatternMemoryMatch = {
  memory: SignalPatternMemory;
  score: number;
  reasons: RelatedPatternMemoryReason[];
};

export type RelatedPatternMemoryMatchOptions = {
  projectId?: string;
  minimumScore?: number;
};

const DEFAULT_MINIMUM_SCORE = 4;
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "but",
  "can",
  "cannot",
  "for",
  "from",
  "has",
  "have",
  "into",
  "not",
  "that",
  "the",
  "their",
  "this",
  "through",
  "with",
  "you",
  "your",
]);

const FORBIDDEN_TEXT_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b0x[a-f0-9]{32,}\b/gi,
  /\b(session|signature|signed[-_]?bytes|wallet[-_]?signature|encrypted[-_]?payload|token|secret)\s*[:=]\s*[^\s,;)]+/gi,
  /\b(session|signature|signed[-_]?bytes|wallet[-_]?signature|encrypted[-_]?payload|token|secret)[-_][A-Za-z0-9_-]+/gi,
];

function sanitizeSafeText(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  let sanitized = value.replace(/https?:\/\/[^\s)'"]+/g, (match) => stripQueryAndHash(match));
  for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  const compacted = sanitized.replace(/\s+/g, " ").trim();
  return compacted ? compacted.slice(0, 260) : undefined;
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

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function normalizeList(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => sanitizeSafeText(value)?.toLowerCase()).filter((value): value is string => Boolean(value)))];
}

function tokenize(value: string | undefined) {
  return new Set(
    (sanitizeSafeText(value) ?? "")
      .toLowerCase()
      .split(/[\s\p{P}\p{S}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)),
  );
}

function countOverlap(left: Set<string>, right: Set<string>) {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function includesNormalized(values: string[], value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = normalizeToken(value);
  return values.some((item) => normalizeToken(item) === normalized);
}

function typeMatchesCategory(type: SignalPatternMemoryType, category: string) {
  const normalizedCategory = normalizeToken(category);
  if (type === "product_request_pattern") {
    return normalizedCategory === "feature";
  }
  if (type === "ux_friction_pattern") {
    return normalizedCategory === "bug";
  }
  if (type === "user_feedback_pattern") {
    return normalizedCategory === "general" || normalizedCategory === "survey";
  }
  return false;
}

function isTriageRelevant(memory: SignalPatternMemory, profile: SafeSignalProfile) {
  if (memory.status === "active" || memory.status === "watching" || memory.status === "investigating") {
    return profile.triageStatus === "new" || profile.triageStatus === "investigating" || profile.triageStatus === "in_progress";
  }
  if (memory.status === "confirmed_fixed" || memory.status === "mitigated") {
    return profile.triageStatus === "fixed" || profile.triageStatus === "closed";
  }
  return false;
}

function addReason(reasons: RelatedPatternMemoryReason[], reason: RelatedPatternMemoryReason) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

export function getSafeSignalProfile(record: SignalRecord, options: { projectId?: string } = {}): SafeSignalProfile {
  const diagnostics = redactSystemSignal(record.submission, { includeStackTraces: false });
  return {
    submissionId: record.submission.id,
    formId: record.submission.formId,
    projectId: options.projectId ?? record.form.projectId,
    category: record.submission.category ?? record.category,
    tags: normalizeList(record.submission.tags),
    priority: record.submission.priority,
    triageStatus: record.submission.triageStatus,
    status: record.submission.status,
    aiSummary: sanitizeSafeText(record.submission.aiSummary),
    subjectPreview: sanitizeSafeText(record.submission.subjectPreview),
    adminNotes: sanitizeSafeText(getVisibleReviewerNotes(record.submission)),
    formTitle: sanitizeSafeText(record.form.title) ?? "",
    fieldLabels: normalizeList(record.form.fields.map((field) => field.label)),
    system: diagnostics
      ? {
          fingerprint: diagnostics.fingerprint,
          routeId: diagnostics.routeId,
          routePath: diagnostics.routePath,
          buildVersion: diagnostics.buildVersion,
        }
      : undefined,
  };
}

function scoreMemory(memory: SignalPatternMemory, profile: SafeSignalProfile, options: RelatedPatternMemoryMatchOptions) {
  let score = 0;
  const reasons: RelatedPatternMemoryReason[] = [];

  if (memory.sourceSignalIds.includes(profile.submissionId)) {
    score += 5;
    addReason(reasons, "source_signal");
  }

  if (profile.system?.fingerprint && memory.fingerprints.includes(profile.system.fingerprint)) {
    score += 4;
    addReason(reasons, "fingerprint");
  }
  if (
    (profile.system?.routeId && memory.affectedRoutes.includes(profile.system.routeId)) ||
    (profile.system?.routePath && memory.affectedRoutes.includes(profile.system.routePath))
  ) {
    score += 3;
    addReason(reasons, "route");
  }
  if (profile.system?.buildVersion && memory.affectedBuilds.includes(profile.system.buildVersion)) {
    score += 3;
    addReason(reasons, "build");
  }

  const tagOverlap = memory.tags.filter((tag) => profile.tags.includes(normalizeToken(tag))).length;
  if (tagOverlap > 0) {
    score += Math.min(3, tagOverlap) * 4;
    addReason(reasons, "shared_tags");
  }

  if (typeMatchesCategory(memory.type, profile.category) || includesNormalized(memory.tags, profile.category)) {
    score += 4;
    addReason(reasons, "same_category");
  }

  if (options.projectId && profile.projectId === options.projectId) {
    const contextText = `${memory.summary} ${memory.title} ${memory.tags.join(" ")}`;
    if (includesNormalized(memory.tags, options.projectId) || contextText.toLowerCase().includes(normalizeToken(options.projectId))) {
      score += 3;
      addReason(reasons, "same_project");
    }
  }

  if (includesNormalized(memory.tags, profile.formId) || includesNormalized(memory.tags, profile.formTitle)) {
    score += 3;
    addReason(reasons, "same_form");
  }

  const profileSummaryTokens = new Set([
    ...tokenize(profile.aiSummary),
    ...tokenize(profile.subjectPreview),
    ...tokenize(profile.adminNotes),
    ...tokenize(profile.fieldLabels.join(" ")),
  ]);
  const memorySummaryTokens = tokenize(`${memory.title} ${memory.summary} ${memory.evidenceSummary.join(" ")} ${memory.tags.join(" ")}`);
  const summaryOverlap = Math.min(3, countOverlap(profileSummaryTokens, memorySummaryTokens));
  if (summaryOverlap > 0) {
    score += summaryOverlap * 3;
    addReason(reasons, "similar_summary");
  }

  if (includesNormalized(memory.tags, profile.priority) || memory.summary.toLowerCase().includes(profile.priority)) {
    score += 2;
    addReason(reasons, "same_priority");
  }

  if (isTriageRelevant(memory, profile) || includesNormalized(memory.tags, profile.triageStatus)) {
    score += 2;
    addReason(reasons, "triage_relevant");
  }

  if (
    (memory.status === "active" || memory.status === "watching" || memory.status === "investigating") &&
    memory.frequency.count > 1
  ) {
    score += 1;
    addReason(reasons, "active_recurring");
  }

  if (memory.status === "stale" || memory.status === "revoked") {
    score -= 3;
  }

  return { score, reasons };
}

export function getRelatedPatternMemoryMatches(
  record: SignalRecord,
  memories: SignalPatternMemory[],
  options: RelatedPatternMemoryMatchOptions = {},
): RelatedPatternMemoryMatch[] {
  const profile = getSafeSignalProfile(record, options);
  const minimumScore = options.minimumScore ?? DEFAULT_MINIMUM_SCORE;
  return memories
    .map((memory) => {
      const { score, reasons } = scoreMemory(memory, profile, options);
      return { memory, score, reasons };
    })
    .filter((match) => match.score >= minimumScore)
    .sort((left, right) => right.score - left.score || right.memory.updatedAt.localeCompare(left.memory.updatedAt));
}
