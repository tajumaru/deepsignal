import type { Submission } from "../types";

export type SubmitterMode = "anonymous" | "wallet" | "zkLogin";
export type SubmissionRemoteSyncStatus = "remote_synced" | "sync_pending" | "local_only";

export interface SubmissionIndexEntry {
  submissionId: string;
  projectId: string;
  formId: string;
  signalId: string;
  answerBlobId: string;
  createdAt: string;
  submitterMode: SubmitterMode;
  submitterWallet?: string | null;
  anonymousSessionId?: string | null;
  status: SubmissionRemoteSyncStatus;
}

export interface SubmissionRemoteIndexWriteLog {
  event: "submission_remote_index_write";
  submissionId: string;
  projectId: string | null;
  formId: string;
  signalId: string;
  answerBlobId: string | null;
  submitterMode: SubmitterMode;
  submitterWallet: string | null;
  anonymousSessionId: string | null;
  remoteIndexTarget: string | null;
  remoteIndexWriteSuccess: boolean;
  remoteIndexReadBackSuccess: boolean;
  ownerReadable: boolean;
  storageMode: string;
  fallbackUsed: boolean;
  syncPending: boolean;
  errorName?: string;
  errorMessage?: string;
}

export interface OwnerSubmissionIndexFetchLog {
  event: "owner_submission_index_fetch";
  viewerRole: string;
  selectedProjectId: string | null;
  remoteIndexSource: string;
  remoteIndexEntryCount: number;
  answerBlobFetchCount: number;
  visibleSubmissionCount: number;
  localFallbackCount: number;
  filteredOutCount: number;
  filterReasons: Record<string, number>;
  walletConnectedState: "connected" | "disconnected";
}

const PENDING_QUEUE_KEY = "deepsignal.submissionDelivery.pendingQueue";
const submissionRelayUrl = String(import.meta.env.VITE_DEEPSIGNAL_SUBMISSION_RELAY_URL || "").replace(/\/$/, "");

function normalizeSubmitterMode(submission: Submission): SubmitterMode {
  const identityKind = submission.respondentMeta?.identityKind;
  if (identityKind === "zklogin") {
    return "zkLogin";
  }
  if (identityKind === "sui_wallet") {
    return "wallet";
  }
  return "anonymous";
}

export function buildSubmissionIndexEntry(
  submission: Submission,
  answerBlobId: string,
  status: SubmissionRemoteSyncStatus,
): SubmissionIndexEntry {
  const submitterMode = normalizeSubmitterMode(submission);
  return {
    submissionId: submission.id,
    projectId: submission.projectId ?? (submission.metadata?.projectId ? String(submission.metadata.projectId) : ""),
    formId: submission.formId,
    signalId: submission.onchainSignalId !== undefined ? String(submission.onchainSignalId) : submission.id,
    answerBlobId,
    createdAt: submission.createdAt,
    submitterMode,
    submitterWallet:
      submitterMode === "anonymous"
        ? null
        : submission.respondentMeta?.verifiedAddress ?? submission.respondentMeta?.walletAddress ?? null,
    anonymousSessionId: submitterMode === "anonymous" ? submission.respondentMeta?.sessionId ?? null : null,
    status,
  };
}

export function writeSubmissionRemoteIndexLog(log: SubmissionRemoteIndexWriteLog) {
  console.info("[deepsignal] submission_remote_index_write", log);
}

export function writeOwnerSubmissionIndexFetchLog(log: OwnerSubmissionIndexFetchLog) {
  console.info("[deepsignal] owner_submission_index_fetch", log);
}

export function enqueuePendingSubmission(submission: Submission) {
  try {
    const raw = window.localStorage.getItem(PENDING_QUEUE_KEY);
    const queue = raw ? (JSON.parse(raw) as Submission[]) : [];
    const next = [
      submission,
      ...queue.filter((item) => item.id !== submission.id),
    ].slice(0, 100);
    window.localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("[deepsignal] failed to enqueue pending submission sync", error);
  }
}

export function listPendingSubmissions() {
  try {
    const raw = window.localStorage.getItem(PENDING_QUEUE_KEY);
    const queue = raw ? (JSON.parse(raw) as Submission[]) : [];
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

export function removePendingSubmission(submissionId: string) {
  try {
    const next = listPendingSubmissions().filter((submission) => submission.id !== submissionId);
    window.localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("[deepsignal] failed to remove pending submission sync", error);
  }
}

export function isRemoteSyncedSubmission(submission: Submission) {
  return submission.remoteSyncStatus === "remote_synced" && submission.remoteIndexUpdated && submission.remoteIndexReadBack;
}

export function getRemoteSubmissionIndexSource() {
  return submissionRelayUrl || "";
}

export async function fetchRemoteSubmissionIndex(args: {
  formId: string;
  projectId?: string | null;
}) {
  if (!submissionRelayUrl) {
    return [] as SubmissionIndexEntry[];
  }
  const searchParams = new URLSearchParams({ formId: args.formId });
  if (args.projectId) {
    searchParams.set("projectId", args.projectId);
  }
  const response = await fetch(`${submissionRelayUrl}/v1/submissions-index?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Remote submission index fetch failed: ${response.status}`);
  }
  const payload = await response.json() as { entries?: SubmissionIndexEntry[] } | SubmissionIndexEntry[];
  const entries = Array.isArray(payload) ? payload : payload.entries;
  return Array.isArray(entries)
    ? entries.filter((entry) => entry.formId === args.formId && entry.answerBlobId)
    : [];
}
