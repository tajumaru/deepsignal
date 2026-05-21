import { getSubmissionRespondentMeta } from "../../../lib/respondentMeta";
import { getSignalPreview } from "../../../lib/signalInbox";
import type { SignalRecord } from "../hooks/useSignalInboxData";

export type RelatedSignalReason =
  | "same_channel"
  | "same_category"
  | "same_triage"
  | "same_priority"
  | "same_severity"
  | "same_sender_type"
  | "shared_keywords"
  | "shared_tags"
  | "similar_text"
  | "exact_subject";

export interface RelatedSignalMatch {
  record: SignalRecord;
  score: number;
  reasons: RelatedSignalReason[];
  sharedKeywords: string[];
  sharedTags: string[];
  sharedTokens: string[];
  duplicateStrength: "possible" | "strong" | null;
}

export interface RelatedSignalsSummary {
  matches: RelatedSignalMatch[];
  duplicateHint: "similar" | "count" | "possible_duplicate" | null;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "into",
  "not",
  "that",
  "the",
  "this",
  "with",
  "was",
  "were",
  "have",
  "has",
  "had",
  "you",
  "your",
  "our",
  "their",
  "after",
  "before",
  "when",
  "where",
  "what",
  "why",
  "how",
]);

function normalizeTerm(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: string) {
  return normalizeTerm(value).replace(/[^a-z0-9\s_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].map(normalizeTerm).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function intersect(left: Iterable<string>, right: Iterable<string>) {
  const rightSet = new Set([...right].map(normalizeTerm));
  return uniqueSorted([...left].filter((value) => rightSet.has(normalizeTerm(value))));
}

function tokenizeVisibleText(record: SignalRecord) {
  const pieces = [record.submission.subjectPreview ?? ""];
  if (!record.submission.isEncrypted) {
    pieces.push(getSignalPreview(record.submission));
  }
  return uniqueSorted(
    normalizeText(pieces.join(" "))
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function getSenderType(record: SignalRecord) {
  return getSubmissionRespondentMeta(record.submission).isAnonymous ? "anonymous" : "verified";
}

function computeMatch(selectedRecord: SignalRecord, candidateRecord: SignalRecord): RelatedSignalMatch | null {
  if (selectedRecord.submission.id === candidateRecord.submission.id) {
    return null;
  }

  const reasons: RelatedSignalReason[] = [];
  const selectedSubmission = selectedRecord.submission;
  const candidateSubmission = candidateRecord.submission;
  const selectedKeywords = uniqueSorted(selectedSubmission.keywords ?? []);
  const candidateKeywords = uniqueSorted(candidateSubmission.keywords ?? []);
  const selectedTags = uniqueSorted(selectedSubmission.tags ?? []);
  const candidateTags = uniqueSorted(candidateSubmission.tags ?? []);
  const selectedTokens = tokenizeVisibleText(selectedRecord);
  const candidateTokens = tokenizeVisibleText(candidateRecord);
  const sharedKeywords = intersect(selectedKeywords, candidateKeywords);
  const sharedTags = intersect(selectedTags, candidateTags);
  const sharedTokens = intersect(selectedTokens, candidateTokens);
  const selectedSubject = normalizeText(selectedSubmission.subjectPreview ?? "");
  const candidateSubject = normalizeText(candidateSubmission.subjectPreview ?? "");
  const sameChannel = selectedRecord.form.id === candidateRecord.form.id;

  let score = 0;

  if (sameChannel) {
    score += 3;
    reasons.push("same_channel");
  }
  if (selectedRecord.category === candidateRecord.category && selectedRecord.category !== "Unknown") {
    score += 2;
    reasons.push("same_category");
  }
  if (selectedSubmission.triageStatus === candidateSubmission.triageStatus) {
    score += 1;
    reasons.push("same_triage");
  }
  const samePriority = selectedSubmission.priority === candidateSubmission.priority;
  const sameSeverity = selectedSubmission.severity && selectedSubmission.severity === candidateSubmission.severity;
  if (samePriority || sameSeverity) {
    score += 1;
  }
  if (samePriority) {
    reasons.push("same_priority");
  }
  if (sameSeverity) {
    reasons.push("same_severity");
  }
  if (getSenderType(selectedRecord) === getSenderType(candidateRecord)) {
    score += 1;
    reasons.push("same_sender_type");
  }
  if (sharedKeywords.length > 0) {
    score += Math.min(3, sharedKeywords.length + 1);
    reasons.push("shared_keywords");
  }
  if (sharedTags.length > 0) {
    score += Math.min(2, sharedTags.length);
    reasons.push("shared_tags");
  }
  if (selectedSubject && candidateSubject && selectedSubject === candidateSubject) {
    score += 4;
    reasons.push("exact_subject");
  } else if (sharedTokens.length > 0) {
    score += Math.min(3, sharedTokens.length);
    reasons.push("similar_text");
  }

  const duplicateStrength =
    sameChannel && (reasons.includes("exact_subject") || sharedKeywords.length >= 2 || sharedTokens.length >= 3)
      ? score >= 8
        ? "strong"
        : score >= 6
          ? "possible"
          : null
      : null;

  const shouldInclude =
    score >= 4 ||
    sharedKeywords.length > 0 ||
    sharedTags.length > 0 ||
    duplicateStrength !== null;

  if (!shouldInclude) {
    return null;
  }

  return {
    record: candidateRecord,
    score,
    reasons,
    sharedKeywords,
    sharedTags,
    sharedTokens,
    duplicateStrength,
  };
}

export function findRelatedSignals({
  selectedRecord,
  visibleSignals,
  allSignals,
  signalById,
  maxResults = 5,
}: {
  selectedRecord: SignalRecord;
  visibleSignals: SignalRecord[];
  allSignals: SignalRecord[];
  signalById?: Record<string, SignalRecord | undefined>;
  maxResults?: number;
}): RelatedSignalsSummary {
  const candidateRecords = new Map<string, SignalRecord>();
  for (const record of visibleSignals) {
    candidateRecords.set(record.submission.id, record);
  }
  for (const record of allSignals) {
    candidateRecords.set(record.submission.id, record);
  }
  if (signalById) {
    for (const record of Object.values(signalById)) {
      if (record) {
        candidateRecords.set(record.submission.id, record);
      }
    }
  }

  const matches = [...candidateRecords.values()]
    .map((record) => computeMatch(selectedRecord, record))
    .filter((match): match is RelatedSignalMatch => Boolean(match))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return Date.parse(right.record.submission.createdAt) - Date.parse(left.record.submission.createdAt);
    })
    .slice(0, maxResults);

  const duplicateHint =
    matches[0]?.duplicateStrength === "strong" || matches[0]?.duplicateStrength === "possible"
      ? "possible_duplicate"
      : matches.length >= 3
        ? "count"
        : matches.length > 0
          ? "similar"
          : null;

  return { matches, duplicateHint };
}
