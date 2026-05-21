import { getSubmissionRespondentMeta } from "./respondentMeta";
import { getSignalPreview, getSignalSubject } from "./signalInbox";
import type { SignalRecord } from "../features/admin/hooks/useSignalInboxData";

export interface RelatedSignalResult {
  record: SignalRecord;
  score: number;
  reasons: RelatedSignalReason[];
  duplicateLikely: boolean;
}

export type RelatedSignalReason =
  | "same_channel"
  | "same_category"
  | "same_priority"
  | "same_triage"
  | "same_sender_type"
  | "shared_tags"
  | "similar_subject"
  | "similar_preview";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "but",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "not",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "this",
  "was",
  "were",
  "with",
  "you",
  "your",
]);

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .trim()
      .split(/[\s\p{P}\p{S}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
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

function isSameSenderType(left: SignalRecord, right: SignalRecord) {
  return (
    getSubmissionRespondentMeta(left.submission).isAnonymous ===
    getSubmissionRespondentMeta(right.submission).isAnonymous
  );
}

function getSafePreviewText(record: SignalRecord) {
  if (record.submission.isEncrypted) {
    return record.submission.subjectPreview?.trim() ?? "";
  }
  return getSignalPreview(record.submission);
}

function getSharedTagCount(selectedRecord: SignalRecord, candidateRecord: SignalRecord) {
  const selectedTags = new Set(selectedRecord.submission.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const candidateTags = new Set(candidateRecord.submission.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  return Math.min(3, countOverlap(selectedTags, candidateTags));
}

function buildResult(selectedRecord: SignalRecord, candidateRecord: SignalRecord): RelatedSignalResult | null {
  if (selectedRecord.submission.id === candidateRecord.submission.id) {
    return null;
  }

  let score = 0;
  const reasons: RelatedSignalReason[] = [];

  if (candidateRecord.form.id === selectedRecord.form.id) {
    score += 3;
    reasons.push("same_channel");
  }

  if (candidateRecord.category === selectedRecord.category) {
    score += 2;
    reasons.push("same_category");
  }

  if (candidateRecord.submission.priority === selectedRecord.submission.priority) {
    score += 1;
    if (!reasons.includes("same_priority")) {
      reasons.push("same_priority");
    }
  }

  if (
    selectedRecord.submission.severity &&
    candidateRecord.submission.severity &&
    candidateRecord.submission.severity === selectedRecord.submission.severity
  ) {
    score += 1;
    if (!reasons.includes("same_priority")) {
      reasons.push("same_priority");
    }
  }

  if (candidateRecord.submission.triageStatus === selectedRecord.submission.triageStatus) {
    score += 1;
    reasons.push("same_triage");
  }

  if (isSameSenderType(selectedRecord, candidateRecord)) {
    score += 1;
    reasons.push("same_sender_type");
  }

  const sharedTagCount = getSharedTagCount(selectedRecord, candidateRecord);
  if (sharedTagCount > 0) {
    score += sharedTagCount;
    reasons.push("shared_tags");
  }

  const subjectOverlap = Math.min(
    3,
    countOverlap(
      tokenize(getSignalSubject(selectedRecord.submission)),
      tokenize(getSignalSubject(candidateRecord.submission)),
    ),
  );
  if (subjectOverlap > 0) {
    score += subjectOverlap;
    reasons.push("similar_subject");
  }

  const previewOverlap = Math.min(
    3,
    countOverlap(tokenize(getSafePreviewText(selectedRecord)), tokenize(getSafePreviewText(candidateRecord))),
  );
  if (previewOverlap > 0) {
    score += previewOverlap;
    reasons.push("similar_preview");
  }

  if (reasons.includes("same_channel") && reasons.includes("similar_subject")) {
    // Same channel plus similar wording is a stronger duplicate signal.
    score += 2;
  }

  if (reasons.includes("same_channel") && reasons.includes("similar_preview")) {
    // Matching safe preview language inside one channel is also a useful tie-breaker.
    score += 1;
  }

  if (score <= 0) {
    return null;
  }

  return {
    record: candidateRecord,
    score,
    reasons,
    duplicateLikely: score >= 6,
  };
}

export function getRelatedSignals({
  selectedRecord,
  records,
  maxResults = 5,
}: {
  selectedRecord: SignalRecord | null;
  records: SignalRecord[];
  maxResults?: number;
}): RelatedSignalResult[] {
  if (!selectedRecord) {
    return [];
  }

  return records
    .map((record) => buildResult(selectedRecord, record))
    .filter((record): record is RelatedSignalResult => Boolean(record))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return Date.parse(right.record.submission.createdAt) - Date.parse(left.record.submission.createdAt);
    })
    .slice(0, maxResults);
}
