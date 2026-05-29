import { localStorageAdapter } from "./localStorageAdapter";
import { getTatumStorageWriteUrl, isTatumStorageEnabled } from "./tatumStorage";
import {
  deleteFormBlobIndex,
} from "./blobIndex";
import {
  applyFormMetadataOverlay,
  applyFormMetadataOverlays,
  clearFormMetadataOverlay,
} from "./formMetadataOverlay";
import { walrusAdapter } from "./walrusAdapter";
import {
  formatWalrusFailureStage,
  getWalrusErrorMessage,
  isWalrusDiagnosticError,
  type WalrusFailureDetails,
} from "./walrusDiagnostics";
import { isLikelyWalletCancelError } from "../crypto/sealPayload";
import type { FormSchema, StorageAdapter, Submission } from "../types";
import { WALRUS_AGGREGATOR_URL, WALRUS_UPLOAD_RELAY_URL } from "../lib/sui";
import {
  enqueuePendingSubmission,
  listPendingSubmissions,
  removePendingSubmission,
  writeSubmissionRemoteIndexLog,
} from "./submissionDelivery";

type RuntimeMode = "walrus" | "local-fallback";
type RuntimeStatus = {
  mode: RuntimeMode;
  notice: string | null;
  diagnostics: WalrusFailureDetails | null;
};

const listeners = new Set<() => void>();
const WALRUS_READ_TIMEOUT_MS = 4000;
const requireWalrus = String(import.meta.env.VITE_REQUIRE_WALRUS).toLowerCase() === "true";
const walrusRequested = requireWalrus || import.meta.env.VITE_STORAGE_MODE === "walrus";
const isProductionRuntime = import.meta.env.PROD;
const walrusWriteMode = String(import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay").toLowerCase();
const tatumStorageConfigured = isTatumStorageEnabled() && Boolean(getTatumStorageWriteUrl());

const walrusConfigured =
  walrusRequested &&
  Boolean(WALRUS_AGGREGATOR_URL) &&
  (walrusWriteMode === "publisher"
    ? Boolean(import.meta.env.VITE_WALRUS_PUBLISHER_URL)
    : walrusWriteMode === "tatum"
      ? tatumStorageConfigured
      : Boolean(WALRUS_UPLOAD_RELAY_URL));

let runtimeStatus: RuntimeStatus = {
  mode: walrusRequested ? "walrus" : "local-fallback",
  notice:
    requireWalrus && !walrusConfigured
      ? walrusWriteMode === "publisher"
        ? "Walrus is required, but the publisher or aggregator URL is not configured."
        : walrusWriteMode === "tatum"
          ? "Walrus is required, but Tatum storage or the aggregator URL is not configured."
        : "Walrus is required, but the upload relay or aggregator URL is not configured."
      : null,
  diagnostics: null,
};

function emitStatus(next: Partial<RuntimeStatus>) {
  runtimeStatus = { ...runtimeStatus, ...next };
  listeners.forEach((listener) => listener());
}

function formatWalrusFallbackNotice(error: unknown) {
  if (isWalrusDiagnosticError(error)) {
    const detail =
      error.details.stage === "rpc-visibility"
        ? "Walrus transaction is still waiting on RPC visibility."
        : error.details.stage === "upload-relay"
          ? "Walrus upload relay timed out before the blob write completed."
        : error.message.trim();
    const digest = error.details.digest ? ` digest=${error.details.digest}` : "";
    return `${detail}${digest} Saved locally instead.`;
  }
  const detail = getWalrusErrorMessage(error) || "Walrus upload failed.";
  return `${detail} Saved locally instead.`;
}

async function swallow<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error("Walrus read timed out."));
        }, WALRUS_READ_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "Walrus read timed out.") {
      return fallback;
    }
    console.error(error);
    return fallback;
  }
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]) {
  const map = new Map<string, T>();
  [...secondary, ...primary].forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

function hasNonEmptyObject(value: Record<string, unknown> | undefined) {
  return Boolean(value && Object.keys(value).length > 0);
}

function hasNonEmptyText(value?: string) {
  return Boolean(value?.trim());
}

function matchesSubmissionIdentity(left: Submission, right: Submission) {
  if (left.id === right.id) {
    return true;
  }
  if (left.receiptBlobId && right.receiptBlobId && left.receiptBlobId === right.receiptBlobId) {
    return true;
  }
  if (
    left.signalReceiptMetadataDigest &&
    right.signalReceiptMetadataDigest &&
    left.signalReceiptMetadataDigest === right.signalReceiptMetadataDigest
  ) {
    return true;
  }
  if (
    typeof left.onchainSignalId === "number" &&
    typeof right.onchainSignalId === "number" &&
    left.onchainSignalId === right.onchainSignalId
  ) {
    return true;
  }
  return false;
}

function getDecryptReadinessScore(submission: Submission) {
  let score = 0;
  if (hasNonEmptyText(submission.encryptedPayload)) {
    score += 16;
  }
  if (hasNonEmptyText(submission.encryptedBlobId)) {
    score += 12;
  }
  if (submission.isEncrypted && hasNonEmptyText(submission.blobId)) {
    score += 8;
  }
  if (hasNonEmptyText(submission.receiptBlobId)) {
    score += 4;
  }
  if (hasNonEmptyObject(submission.answers)) {
    score += 2;
  }
  if (submission.attachments.length > 0) {
    score += 1;
  }
  return score;
}

function mergeSubmissionRecord(primary: Submission, secondary: Submission) {
  const decryptPreferred =
    getDecryptReadinessScore(primary) >= getDecryptReadinessScore(secondary) ? primary : secondary;
  const metadataPreferred =
    Date.parse(primary.updatedAt || primary.createdAt) >= Date.parse(secondary.updatedAt || secondary.createdAt)
      ? primary
      : secondary;

  return {
    ...decryptPreferred,
    status: metadataPreferred.status,
    priority: metadataPreferred.priority,
    triageStatus: metadataPreferred.triageStatus,
    notes: hasNonEmptyText(metadataPreferred.notes) ? metadataPreferred.notes : decryptPreferred.notes,
    tags: metadataPreferred.tags.length > 0 ? metadataPreferred.tags : decryptPreferred.tags,
    encryptedBlobId: decryptPreferred.encryptedBlobId ?? metadataPreferred.encryptedBlobId,
    encryptedPayload: decryptPreferred.encryptedPayload ?? metadataPreferred.encryptedPayload,
    answerBlobId: decryptPreferred.answerBlobId ?? metadataPreferred.answerBlobId,
    receiptBlobId: decryptPreferred.receiptBlobId ?? metadataPreferred.receiptBlobId,
    remoteIndexBlobId: metadataPreferred.remoteIndexBlobId ?? decryptPreferred.remoteIndexBlobId,
    remoteIndexTarget: metadataPreferred.remoteIndexTarget ?? decryptPreferred.remoteIndexTarget,
    remoteIndexUpdated: metadataPreferred.remoteIndexUpdated ?? decryptPreferred.remoteIndexUpdated,
    remoteIndexReadBack: metadataPreferred.remoteIndexReadBack ?? decryptPreferred.remoteIndexReadBack,
    ownerReadable: metadataPreferred.ownerReadable ?? decryptPreferred.ownerReadable,
    remoteSyncStatus: metadataPreferred.remoteSyncStatus ?? decryptPreferred.remoteSyncStatus,
    blobId: decryptPreferred.blobId ?? metadataPreferred.blobId,
    tatumStorage: decryptPreferred.tatumStorage ?? metadataPreferred.tatumStorage,
    signalReceiptMetadataDigest:
      decryptPreferred.signalReceiptMetadataDigest ?? metadataPreferred.signalReceiptMetadataDigest,
    onchainSignalId: decryptPreferred.onchainSignalId ?? metadataPreferred.onchainSignalId,
    onchainStatus: decryptPreferred.onchainStatus ?? metadataPreferred.onchainStatus,
    walrusProof: decryptPreferred.walrusProof ?? metadataPreferred.walrusProof,
    encryptedWalrusProof: decryptPreferred.encryptedWalrusProof ?? metadataPreferred.encryptedWalrusProof,
    subjectPreview: decryptPreferred.subjectPreview ?? metadataPreferred.subjectPreview,
    responderSignature: decryptPreferred.responderSignature ?? metadataPreferred.responderSignature,
    responderSignedBytes: decryptPreferred.responderSignedBytes ?? metadataPreferred.responderSignedBytes,
    responderSignedAt: decryptPreferred.responderSignedAt ?? metadataPreferred.responderSignedAt,
  } satisfies Submission;
}

function mergeSubmissionsById(primary: Submission[], secondary: Submission[]) {
  const merged: Submission[] = [...secondary];
  for (const item of primary) {
    const existingIndex = merged.findIndex((entry) => matchesSubmissionIdentity(entry, item));
    if (existingIndex === -1) {
      merged.push(item);
      continue;
    }
    merged[existingIndex] = mergeSubmissionRecord(item, merged[existingIndex]);
  }
  return merged;
}

async function withWriteFallback<T>(walrusTask: () => Promise<T>, localTask: () => Promise<T>) {
  try {
    const result = await walrusTask();
    emitStatus({ mode: "walrus", notice: null, diagnostics: null });
    return result;
  } catch (error) {
    if (isLikelyWalletCancelError(error)) {
      console.info("Walrus write cancelled in wallet; skipping local fallback.");
      emitStatus({
        mode: "walrus",
        notice: error instanceof Error ? error.message : "Wallet approval was cancelled.",
        diagnostics: isWalrusDiagnosticError(error) ? error.details : null,
      });
      throw error;
    }
    if (requireWalrus) {
      console.error(error);
      emitStatus({
        mode: "walrus",
        notice: error instanceof Error ? error.message : "Walrus is required for this build.",
        diagnostics: isWalrusDiagnosticError(error) ? error.details : null,
      });
      throw error;
    }
    console.warn("Walrus write failed; using local fallback.", error);
    emitStatus({
      mode: "local-fallback",
      notice: formatWalrusFallbackNotice(error),
      diagnostics: isWalrusDiagnosticError(error) ? error.details : null,
    });
    return localTask();
  }
}

async function withProtectedWriteFallback<T>(walrusTask: () => Promise<T>) {
  try {
    const result = await walrusTask();
    emitStatus({ mode: "walrus", notice: null, diagnostics: null });
    return result;
  } catch (error) {
    console.error(error);
    emitStatus({
      mode: walrusRequested ? "walrus" : "local-fallback",
      notice:
        error instanceof Error
          ? error.message
          : "Protected encrypted storage is unavailable in this runtime.",
      diagnostics: isWalrusDiagnosticError(error) ? error.details : null,
    });
    throw error;
  }
}

const hybridWalrusStorage: StorageAdapter = {
  async saveForm(form) {
    return withWriteFallback(
      () => walrusAdapter.saveForm(form),
      () => localStorageAdapter.saveForm(form),
    );
  },
  async getForm(id) {
    const walrus = await swallow(() => walrusAdapter.getForm(id), null);
    if (walrus) {
      return applyFormMetadataOverlay(walrus);
    }
    return applyFormMetadataOverlay(await localStorageAdapter.getForm(id));
  },
  async listForms() {
    const [walrusForms, localForms] = await Promise.all([
      swallow(() => walrusAdapter.listForms(), [] as FormSchema[]),
      localStorageAdapter.listForms(),
    ]);
    return applyFormMetadataOverlays(mergeById(walrusForms, localForms));
  },
  async deleteForm(id) {
    await this.deleteForms([id]);
  },
  async deleteForms(ids) {
    if (ids.length === 0) {
      return;
    }
    if (!walrusRequested) {
      await localStorageAdapter.deleteForms(ids);
      ids.forEach((id) => clearFormMetadataOverlay(id));
      return;
    }
    try {
      await walrusAdapter.deleteForms(ids);
      await localStorageAdapter.deleteForms(ids);
      ids.forEach((id) => clearFormMetadataOverlay(id));
      emitStatus({ mode: "walrus", notice: null, diagnostics: null });
    } catch (error) {
      if (requireWalrus) {
        console.error(error);
        emitStatus({
          mode: "walrus",
          notice: error instanceof Error ? error.message : "Walrus delete failed.",
          diagnostics: isWalrusDiagnosticError(error) ? error.details : null,
        });
        throw error;
      }
      console.warn("Walrus delete failed; deleting local fallback records.", error);
      await localStorageAdapter.deleteForms(ids);
      ids.forEach((id) => clearFormMetadataOverlay(id));
      emitStatus({
        mode: "local-fallback",
        notice: "Walrus delete was unavailable. Removed local records from this browser.",
        diagnostics: isWalrusDiagnosticError(error) ? error.details : null,
      });
    }
  },
  async saveSubmission(submission) {
    if (submission.isEncrypted && isProductionRuntime) {
      return withProtectedWriteFallback(() => walrusAdapter.saveSubmission(submission));
    }
    return withWriteFallback(
      () => walrusAdapter.saveSubmission(submission),
      () => {
        const pendingSubmission = {
          ...submission,
          remoteIndexUpdated: false,
          remoteIndexReadBack: false,
          ownerReadable: false,
          remoteSyncStatus: "local_only" as const,
        };
        enqueuePendingSubmission(pendingSubmission);
        writeSubmissionRemoteIndexLog({
          event: "submission_remote_index_write",
          submissionId: submission.id,
          projectId: submission.projectId ?? null,
          formId: submission.formId,
          signalId: typeof submission.onchainSignalId === "number" ? String(submission.onchainSignalId) : submission.id,
          answerBlobId: null,
          submitterMode:
            submission.respondentMeta?.identityKind === "zklogin"
              ? "zkLogin"
              : submission.respondentMeta?.identityKind === "sui_wallet"
                ? "wallet"
                : "anonymous",
          submitterWallet: submission.respondentMeta?.verifiedAddress ?? submission.respondentMeta?.walletAddress ?? null,
          anonymousSessionId: submission.respondentMeta?.sessionId ?? null,
          remoteIndexTarget: null,
          remoteIndexWriteSuccess: false,
          remoteIndexReadBackSuccess: false,
          ownerReadable: false,
          storageMode: "local-fallback",
          fallbackUsed: true,
          syncPending: true,
        });
        return localStorageAdapter.saveSubmission(pendingSubmission);
      },
    );
  },
  async saveEncryptedSubmission(submission) {
    const saveLocalEncryptedSubmission = async () => {
      const pendingSubmission = {
        ...submission,
        remoteIndexUpdated: false,
        remoteIndexReadBack: false,
        ownerReadable: false,
        remoteSyncStatus: "local_only" as const,
      };
      enqueuePendingSubmission(pendingSubmission);
      if (!submission.encryptedPayload) {
        return localStorageAdapter.saveSubmission(pendingSubmission);
      }
      const encryptedPayload = await localStorageAdapter.saveEncryptedPayload(submission.encryptedPayload);
      const saved = await localStorageAdapter.saveSubmission({
        ...pendingSubmission,
        encryptedBlobId: encryptedPayload.blobId,
        encryptedPayload: undefined,
      });
      return { ...saved, encryptedBlobId: encryptedPayload.blobId };
    };
    if (isProductionRuntime) {
      return withProtectedWriteFallback(() => walrusAdapter.saveEncryptedSubmission?.(submission) ?? walrusAdapter.saveSubmission(submission));
    }
    return withWriteFallback(
      () => walrusAdapter.saveEncryptedSubmission?.(submission) ?? walrusAdapter.saveSubmission(submission),
      saveLocalEncryptedSubmission,
    );
  },
  async listSubmissions(formId) {
    const [walrusSubmissions, localSubmissions] = await Promise.all([
      swallow(() => walrusAdapter.listSubmissions(formId), [] as Submission[]),
      localStorageAdapter.listSubmissions(formId),
    ]);
    return mergeSubmissionsById(walrusSubmissions, localSubmissions).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  },
  async updateSubmission(submission) {
    return withWriteFallback(
      () => walrusAdapter.updateSubmission(submission),
      () => localStorageAdapter.updateSubmission(submission),
    );
  },
  async saveEncryptedPayload(payload) {
    if (isProductionRuntime) {
      return withProtectedWriteFallback(() => walrusAdapter.saveEncryptedPayload(payload));
    }
    return withWriteFallback(
      () => walrusAdapter.saveEncryptedPayload(payload),
      () => localStorageAdapter.saveEncryptedPayload(payload),
    );
  },
  async readEncryptedPayload(blobId) {
    const walrusPayload = await swallow(() => walrusAdapter.readEncryptedPayload(blobId), null);
    if (walrusPayload) {
      return walrusPayload;
    }
    if (isProductionRuntime) {
      return null;
    }
    return localStorageAdapter.readEncryptedPayload(blobId);
  },
  async uploadFile(file) {
    return withWriteFallback(
      () => walrusAdapter.uploadFile(file),
      () => localStorageAdapter.uploadFile(file),
    );
  },
  async readFileBlob(blobId) {
    const walrusBlob = await swallow(() => walrusAdapter.readFileBlob(blobId), null);
    if (walrusBlob) {
      return walrusBlob;
    }
    return localStorageAdapter.readFileBlob(blobId);
  },
  async readFileText(blobId) {
    const walrusText = await swallow(() => walrusAdapter.readFileText(blobId), null);
    if (walrusText) {
      return walrusText;
    }
    return localStorageAdapter.readFileText(blobId);
  },
};

export const storage: StorageAdapter = walrusRequested ? hybridWalrusStorage : localStorageAdapter;

export function getStorageRuntimeStatus() {
  return runtimeStatus;
}

export async function deleteFormsFromLocalCache(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return;
  }
  await localStorageAdapter.deleteForms(uniqueIds);
  uniqueIds.forEach((id) => {
    clearFormMetadataOverlay(id);
    deleteFormBlobIndex(id);
  });
}

export function getStorageRuntimeStageLabel() {
  return runtimeStatus.diagnostics ? formatWalrusFailureStage(runtimeStatus.diagnostics.stage) : null;
}

export function subscribeStorageRuntime(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function retryPendingSubmissionSync() {
  const pending = listPendingSubmissions();
  if (pending.length === 0) {
    return { attempted: 0, synced: 0 };
  }
  let synced = 0;
  for (const submission of pending) {
    try {
      const result = await walrusAdapter.saveSubmission({
        ...submission,
        remoteSyncStatus: "sync_pending",
        deliveryStatus: "inbox_pending",
        deliveryStatuses: ["stored_local", "stored_walrus", "inbox_pending"],
      });
      const remoteSynced =
        result.remoteSyncStatus === "remote_synced" &&
        result.remoteIndexUpdated === true &&
        result.remoteIndexReadBack === true &&
        result.ownerReadable === true;
      if (!remoteSynced) {
        continue;
      }
      await localStorageAdapter.saveSubmission({
        ...submission,
        blobId: result.blobId,
        answerBlobId: result.answerBlobId ?? result.blobId,
        receiptBlobId: result.answerBlobId ?? result.blobId,
        remoteIndexBlobId: result.remoteIndexBlobId,
        remoteIndexTarget: result.remoteIndexTarget,
        remoteIndexUpdated: true,
        remoteIndexReadBack: true,
        ownerReadable: true,
        remoteSyncStatus: "remote_synced",
        deliveryStatus: "inbox_synced",
        deliveryStatuses: ["stored_local", "stored_walrus", "inbox_synced"],
        walrusProof: result.walrusProof,
        tatumStorage: result.tatumStorage,
      });
      removePendingSubmission(submission.id);
      synced += 1;
    } catch (error) {
      console.warn("[deepsignal] pending submission remote sync retry failed", {
        submissionId: submission.id,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { attempted: pending.length, synced };
}

export function getBlobViewerUrl(blobId?: string) {
  if (
    !blobId ||
    blobId.startsWith("local-") ||
    blobId.startsWith("todo-") ||
    blobId.startsWith("walrus-form-") ||
    blobId.startsWith("walrus-submission-") ||
    blobId.startsWith("walrus-file-")
  ) {
    return null;
  }
  const aggregator = import.meta.env.VITE_WALRUS_AGGREGATOR_URL?.replace(/\/$/, "");
  return aggregator ? `${aggregator}/v1/blobs/${blobId}` : null;
}
