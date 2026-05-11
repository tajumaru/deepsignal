import { localStorageAdapter } from "./localStorageAdapter";
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
import type { FormSchema, StorageAdapter, Submission } from "../types";
import { WALRUS_AGGREGATOR_URL, WALRUS_UPLOAD_RELAY_URL } from "../lib/sui";

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
const walrusWriteMode = String(import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay").toLowerCase();

const walrusConfigured =
  walrusRequested &&
  Boolean(WALRUS_AGGREGATOR_URL) &&
  (walrusWriteMode === "publisher"
    ? Boolean(import.meta.env.VITE_WALRUS_PUBLISHER_URL)
    : Boolean(WALRUS_UPLOAD_RELAY_URL));

let runtimeStatus: RuntimeStatus = {
  mode: walrusRequested ? "walrus" : "local-fallback",
  notice:
    requireWalrus && !walrusConfigured
      ? walrusWriteMode === "publisher"
        ? "Walrus is required, but the publisher or aggregator URL is not configured."
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
    console.error(error);
    return fallback;
  }
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]) {
  const map = new Map<string, T>();
  [...secondary, ...primary].forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

async function withWriteFallback<T>(walrusTask: () => Promise<T>, localTask: () => Promise<T>) {
  try {
    const result = await walrusTask();
    emitStatus({ mode: "walrus", notice: null, diagnostics: null });
    return result;
  } catch (error) {
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
      console.error(error);
      emitStatus({
        mode: "walrus",
        notice: error instanceof Error ? error.message : "Walrus delete failed.",
        diagnostics: isWalrusDiagnosticError(error) ? error.details : null,
      });
      throw error;
    }
  },
  async saveSubmission(submission) {
    return withWriteFallback(
      () => walrusAdapter.saveSubmission(submission),
      () => localStorageAdapter.saveSubmission(submission),
    );
  },
  async listSubmissions(formId) {
    const [walrusSubmissions, localSubmissions] = await Promise.all([
      swallow(() => walrusAdapter.listSubmissions(formId), [] as Submission[]),
      localStorageAdapter.listSubmissions(formId),
    ]);
    return mergeById(walrusSubmissions, localSubmissions).sort((left, right) =>
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
    return localStorageAdapter.readEncryptedPayload(blobId);
  },
  async uploadFile(file) {
    return withWriteFallback(
      () => walrusAdapter.uploadFile(file),
      () => localStorageAdapter.uploadFile(file),
    );
  },
};

export const storage: StorageAdapter = walrusRequested ? hybridWalrusStorage : localStorageAdapter;

export function getStorageRuntimeStatus() {
  return runtimeStatus;
}

export function getStorageRuntimeStageLabel() {
  return runtimeStatus.diagnostics ? formatWalrusFailureStage(runtimeStatus.diagnostics.stage) : null;
}

export function subscribeStorageRuntime(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
