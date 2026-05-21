import { shortAddress } from "./sui";
import type { Submission } from "../types";

export const REVIEWER_META_MARKER = "DS_REVIEW_META";
export const NEEDS_FOLLOW_UP_TAG = "needs-follow-up";

export interface ReviewCollaborationMeta {
  reviewer?: string;
  noteUpdatedAt?: string;
}

export interface ParsedReviewNotes {
  visibleNotes: string;
  meta: ReviewCollaborationMeta;
}

function normalizeReviewerValue(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function buildMetaComment(meta: ReviewCollaborationMeta) {
  const serialized = JSON.stringify(meta);
  return `<!--${REVIEWER_META_MARKER}:${serialized}-->`;
}

export function parseReviewNotes(notes: string | undefined): ParsedReviewNotes {
  const rawNotes = typeof notes === "string" ? notes : "";
  const match = rawNotes.match(new RegExp(`\\n?<!--${REVIEWER_META_MARKER}:(.*?)-->\\s*$`, "s"));
  if (!match) {
    return {
      visibleNotes: rawNotes,
      meta: {},
    };
  }

  const visibleNotes = rawNotes.slice(0, match.index).replace(/\s+$/, "");
  try {
    const parsed = JSON.parse(match[1]) as ReviewCollaborationMeta;
    return {
      visibleNotes,
      meta: {
        reviewer: normalizeReviewerValue(parsed.reviewer),
        noteUpdatedAt: typeof parsed.noteUpdatedAt === "string" ? parsed.noteUpdatedAt : undefined,
      },
    };
  } catch {
    return {
      visibleNotes: rawNotes,
      meta: {},
    };
  }
}

export function serializeReviewNotes(visibleNotes: string, meta: ReviewCollaborationMeta) {
  const nextVisibleNotes = visibleNotes.replace(/\s+$/, "");
  const nextMeta: ReviewCollaborationMeta = {};

  if (normalizeReviewerValue(meta.reviewer)) {
    nextMeta.reviewer = normalizeReviewerValue(meta.reviewer);
  }
  if (typeof meta.noteUpdatedAt === "string" && meta.noteUpdatedAt.trim()) {
    nextMeta.noteUpdatedAt = meta.noteUpdatedAt;
  }

  if (!nextMeta.reviewer && !nextMeta.noteUpdatedAt) {
    return nextVisibleNotes;
  }

  return nextVisibleNotes
    ? `${nextVisibleNotes}\n\n${buildMetaComment(nextMeta)}`
    : buildMetaComment(nextMeta);
}

export function getAssignedReviewer(submission: Submission) {
  return parseReviewNotes(submission.notes).meta.reviewer;
}

export function getReviewerInputValue(submission: Submission) {
  return getAssignedReviewer(submission) ?? "";
}

export function getVisibleReviewerNotes(submission: Submission) {
  return parseReviewNotes(submission.notes).visibleNotes;
}

export function getReviewerNoteUpdatedAt(submission: Submission) {
  return parseReviewNotes(submission.notes).meta.noteUpdatedAt;
}

export function hasNeedsFollowUp(submission: Submission) {
  return submission.tags.some((tag) => tag.trim().toLowerCase() === NEEDS_FOLLOW_UP_TAG);
}

export function setNeedsFollowUpTag(tags: string[], enabled: boolean) {
  const nextTags = tags.filter((tag) => tag.trim().toLowerCase() !== NEEDS_FOLLOW_UP_TAG);
  return enabled ? [...nextTags, NEEDS_FOLLOW_UP_TAG] : nextTags;
}

export function getReviewerPresenceText(submission: Submission, accountAddress?: string | null) {
  const reviewer = getAssignedReviewer(submission);
  if (reviewer) {
    if (accountAddress && reviewer.trim().toLowerCase() === accountAddress.trim().toLowerCase()) {
      return {
        shortLabel: "You",
        fullLabel: "You are reviewing",
      };
    }
    return {
      shortLabel: reviewer.length > 16 ? shortAddress(reviewer) : reviewer,
      fullLabel: `Assigned to ${reviewer}`,
    };
  }

  if (submission.triageStatus === "investigating" || submission.triageStatus === "in_progress" || submission.status === "read") {
    return {
      shortLabel: "Reviewing",
      fullLabel: "Reviewing",
    };
  }

  return null;
}
