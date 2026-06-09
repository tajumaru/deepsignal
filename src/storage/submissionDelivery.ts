import type { Submission } from "../types";
import { logRouteLifecycle } from "../lib/routeDiagnostics";

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
export const PENDING_SUBMISSION_QUEUE_CHANGED_EVENT = "deepsignal:pending-submission-queue-changed";
const REMOTE_SUBMISSION_INDEX_CACHE_TTL_MS = 15000;
const REMOTE_SUBMISSION_INDEX_TIMEOUT_MS = 10000;
const REMOTE_SUBMISSION_INDEX_CALLBACK_REGISTRY_KEY = "__deepsignalRemoteIndexCallbacks";
const submissionRelayUrl = String(import.meta.env.VITE_DEEPSIGNAL_SUBMISSION_RELAY_URL || "").replace(/\/$/, "");
const submissionRelayIsAppsScript = submissionRelayUrl.includes("script.google.com/macros/");
const remoteSubmissionIndexRequests = new Map<string, {
  expiresAt: number;
  promise: Promise<SubmissionIndexEntry[]>;
}>();

function getWindowCallbackRegistry() {
  return window as unknown as Record<string, unknown>;
}

function getRemoteSubmissionIndexCallbackRegistry() {
  const registryOwner = getWindowCallbackRegistry() as Record<string, unknown> & {
    [REMOTE_SUBMISSION_INDEX_CALLBACK_REGISTRY_KEY]?: Record<string, unknown>;
  };
  registryOwner[REMOTE_SUBMISSION_INDEX_CALLBACK_REGISTRY_KEY] ??= {};
  return registryOwner[REMOTE_SUBMISSION_INDEX_CALLBACK_REGISTRY_KEY] as Record<string, unknown>;
}

function notifyPendingQueueChanged() {
  window.dispatchEvent(new Event(PENDING_SUBMISSION_QUEUE_CHANGED_EVENT));
}

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
    notifyPendingQueueChanged();
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
    notifyPendingQueueChanged();
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
  const cacheKey = `${args.projectId || ""}\u0000${args.formId}`;
  const cached = remoteSubmissionIndexRequests.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }
  const searchParams = new URLSearchParams({ formId: args.formId });
  if (args.projectId) {
    searchParams.set("projectId", args.projectId);
  }
  const promise = submissionRelayIsAppsScript
    ? fetchAppsScriptSubmissionIndex(searchParams, args.formId)
    : fetchHttpSubmissionIndex(searchParams, args.formId);
  remoteSubmissionIndexRequests.set(cacheKey, {
    expiresAt: Date.now() + REMOTE_SUBMISSION_INDEX_CACHE_TTL_MS,
    promise,
  });
  promise.catch(() => {
    const current = remoteSubmissionIndexRequests.get(cacheKey);
    if (current?.promise === promise) {
      remoteSubmissionIndexRequests.delete(cacheKey);
    }
  });
  return promise;
}

async function fetchHttpSubmissionIndex(searchParams: URLSearchParams, formId: string) {
  const response = await fetch(`${submissionRelayUrl}/v1/submissions-index?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Remote submission index fetch failed: ${response.status}`);
  }
  const payload = await response.json() as { entries?: SubmissionIndexEntry[] } | SubmissionIndexEntry[];
  const entries = Array.isArray(payload) ? payload : payload.entries;
  return Array.isArray(entries)
    ? entries.filter((entry) => entry.formId === formId && entry.answerBlobId)
    : [];
}

function normalizeIndexEntries(payload: { entries?: unknown } | SubmissionIndexEntry[] | null, formId: string) {
  const rawEntries = Array.isArray(payload) ? payload : payload?.entries;
  if (!Array.isArray(rawEntries)) {
    return [] as SubmissionIndexEntry[];
  }
  return rawEntries.reduce<SubmissionIndexEntry[]>((entries, raw) => {
    if (!raw || typeof raw !== "object") {
      return entries;
    }
    const entry = raw as Partial<SubmissionIndexEntry>;
    if (
      typeof entry.submissionId !== "string" ||
      typeof entry.projectId !== "string" ||
      typeof entry.formId !== "string" ||
      typeof entry.signalId !== "string" ||
      typeof entry.answerBlobId !== "string" ||
      typeof entry.createdAt !== "string" ||
      entry.formId !== formId
    ) {
      return entries;
    }
    entries.push({
      submissionId: entry.submissionId,
      projectId: entry.projectId,
      formId: entry.formId,
      signalId: entry.signalId,
      answerBlobId: entry.answerBlobId,
      createdAt: entry.createdAt,
      submitterMode:
        entry.submitterMode === "wallet" || entry.submitterMode === "zkLogin" ? entry.submitterMode : "anonymous",
      submitterWallet: entry.submitterWallet ?? null,
      anonymousSessionId: entry.anonymousSessionId ?? null,
      status: entry.status === "sync_pending" || entry.status === "local_only" ? entry.status : "remote_synced",
    });
    return entries;
  }, []);
}

async function fetchAppsScriptSubmissionIndex(searchParams: URLSearchParams, formId: string) {
  const callbackId = Math.random().toString(36).slice(2, 10);
  const callbackName = `deepsignalRemoteIndexCallbacks.${callbackId}`;
  const requestUrl = new URL(submissionRelayUrl);
  searchParams.forEach((value, key) => requestUrl.searchParams.set(key, value));
  requestUrl.searchParams.set("callback", callbackName);
  let timeoutId = 0;
  let settled = false;
  let script: HTMLScriptElement | null = null;

  const cleanup = () => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = 0;
    }
    try {
      delete getRemoteSubmissionIndexCallbackRegistry()[callbackId];
    } catch {
      getRemoteSubmissionIndexCallbackRegistry()[callbackId] = undefined;
    }
    script?.remove();
    script = null;
  };

  try {
    logRouteLifecycle("remote-sync:index-fetch-start", {
      formId,
      provider: "google-apps-script",
      requestMode: "jsonp",
      callbackName,
      requestUrl: requestUrl.toString(),
    });

    const payload = await new Promise<{ entries?: unknown } | SubmissionIndexEntry[] | null>((resolve, reject) => {
      getRemoteSubmissionIndexCallbackRegistry()[callbackId] = (value: { entries?: unknown } | SubmissionIndexEntry[] | null) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };

      script = document.createElement("script");
      script.async = true;
      script.src = requestUrl.toString();
      script.onerror = () => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error("Remote submission index Apps Script JSONP load failed."));
      };

      timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error("Remote submission index Apps Script JSONP timed out."));
      }, REMOTE_SUBMISSION_INDEX_TIMEOUT_MS);

      document.head.appendChild(script);
    });

    const entries = normalizeIndexEntries(payload, formId);
    logRouteLifecycle("remote-sync:index-fetch-success", {
      formId,
      provider: "google-apps-script",
      entryCount: entries.length,
      callbackName,
    });
    return entries;
  } catch (error) {
    logRouteLifecycle("remote-sync:index-fetch-degraded", {
      formId,
      provider: "google-apps-script",
      status: "local_only",
      callbackName,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [] as SubmissionIndexEntry[];
  } finally {
    cleanup();
  }
}
