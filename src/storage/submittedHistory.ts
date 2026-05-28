import type { FormField, FormSchema, Submission, SubmissionAttachment, SubmissionLocation } from "../types";

const SUBMITTED_HISTORY_KEY = "deepsignal.submittedHistory.v1";

export type SubmittedHistoryIdentity =
  | { kind: "anonymous" }
  | { kind: "wallet"; walletAddress: string };

export interface SubmittedHistorySnapshot {
  answers: Record<string, unknown>;
  fields: FormField[];
  formVersion?: number;
  formBlobId?: string;
  schemaHash?: string;
  manifestBlobId?: string;
  attachments: SubmissionAttachment[];
  location?: SubmissionLocation;
  isEncrypted: boolean;
}

export interface SubmittedHistoryEntry {
  submissionId: string;
  formId: string;
  formVersion?: number;
  formBlobId?: string;
  schemaHash?: string;
  manifestBlobId?: string;
  submissionBlobId?: string;
  submittedAt: string;
  title?: string;
  formTitle?: string;
  storageMode: string;
  ownerProjectId?: string;
  identity: SubmittedHistoryIdentity;
  revokeRequested?: boolean;
  revokeRequestedAt?: string;
  revokeReason?: string;
  snapshot?: SubmittedHistorySnapshot;
}

export interface SubmittedRevokeRequest {
  submissionId: string;
  revokeRequestedAt: string;
  revokeReason?: string;
}

function normalizeWalletAddress(address?: string | null) {
  return address?.trim().toLowerCase() || "";
}

function getIdentityKey(identity: SubmittedHistoryIdentity) {
  return identity.kind === "wallet" ? `wallet:${normalizeWalletAddress(identity.walletAddress)}` : "anonymous";
}

function readHistory(): SubmittedHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(SUBMITTED_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSubmittedHistoryEntry) : [];
  } catch (error) {
    console.warn("[submitted history] failed to read local history", error);
    return [];
  }
}

function writeHistory(entries: SubmittedHistoryEntry[]) {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.setItem(SUBMITTED_HISTORY_KEY, JSON.stringify(entries));
    return true;
  } catch (error) {
    console.warn("[submitted history] failed to write local history", error);
    return false;
  }
}

function isSubmittedHistoryEntry(value: unknown): value is SubmittedHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<SubmittedHistoryEntry>;
  return (
    typeof entry.submissionId === "string" &&
    typeof entry.formId === "string" &&
    typeof entry.submittedAt === "string" &&
    typeof entry.storageMode === "string"
  );
}

export function createSubmittedHistoryIdentity(walletAddress?: string | null): SubmittedHistoryIdentity {
  const normalized = normalizeWalletAddress(walletAddress);
  return normalized ? { kind: "wallet", walletAddress: normalized } : { kind: "anonymous" };
}

export function saveSubmittedHistoryEntry({
  form,
  submission,
  storageMode,
  walletAddress,
}: {
  form: FormSchema;
  submission: Submission;
  storageMode: string;
  walletAddress?: string | null;
}) {
  const identity = createSubmittedHistoryIdentity(walletAddress);
  const entry: SubmittedHistoryEntry = {
    submissionId: submission.id,
    formId: submission.formId,
    formVersion: submission.formVersion ?? form.formVersion,
    formBlobId: submission.formBlobId ?? form.blobId,
    schemaHash: submission.schemaHash ?? form.schemaHash,
    manifestBlobId: submission.manifestBlobId ?? form.manifestBlobId,
    submissionBlobId: submission.answerBlobId ?? submission.receiptBlobId ?? submission.encryptedBlobId ?? submission.blobId,
    submittedAt: submission.respondentMeta?.submittedAt ?? submission.createdAt,
    title: submission.subjectPreview ?? form.title,
    formTitle: form.title,
    storageMode,
    ownerProjectId: submission.projectId ?? form.projectId,
    identity,
    snapshot: {
      answers: submission.answers,
      fields: form.fields,
      formVersion: submission.formVersion ?? form.formVersion,
      formBlobId: submission.formBlobId ?? form.blobId,
      schemaHash: submission.schemaHash ?? form.schemaHash,
      manifestBlobId: submission.manifestBlobId ?? form.manifestBlobId,
      attachments: submission.attachments,
      location: submission.location,
      isEncrypted: submission.isEncrypted,
    },
  };
  const entries = readHistory();
  const nextEntries = [
    entry,
    ...entries.filter((item) => item.submissionId !== entry.submissionId),
  ].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  writeHistory(nextEntries);
}

export function listSubmittedHistory(walletAddress?: string | null) {
  const identityKey = getIdentityKey(createSubmittedHistoryIdentity(walletAddress));
  return readHistory().filter((entry) => {
    if (!entry.identity) {
      return identityKey === "anonymous";
    }
    return getIdentityKey(entry.identity) === identityKey;
  });
}

export function getSubmittedHistoryEntry(submissionId: string, walletAddress?: string | null) {
  return listSubmittedHistory(walletAddress).find((entry) => entry.submissionId === submissionId) ?? null;
}

export function requestSubmittedHistoryRevoke({
  submissionId,
  walletAddress,
  revokeReason,
}: {
  submissionId: string;
  walletAddress?: string | null;
  revokeReason?: string;
}): SubmittedRevokeRequest | null {
  const identityKey = getIdentityKey(createSubmittedHistoryIdentity(walletAddress));
  const entries = readHistory();
  const revokeRequestedAt = new Date().toISOString();
  let updated = false;
  const nextEntries = entries.map((entry) => {
    const entryIdentityKey = entry.identity ? getIdentityKey(entry.identity) : "anonymous";
    if (entry.submissionId !== submissionId || entryIdentityKey !== identityKey) {
      return entry;
    }
    updated = true;
    return {
      ...entry,
      revokeRequested: true,
      revokeRequestedAt,
      revokeReason: revokeReason?.trim() || undefined,
    } satisfies SubmittedHistoryEntry;
  });
  if (!updated) {
    return null;
  }
  writeHistory(nextEntries);
  return {
    submissionId,
    revokeRequestedAt,
    revokeReason: revokeReason?.trim() || undefined,
  };
}
