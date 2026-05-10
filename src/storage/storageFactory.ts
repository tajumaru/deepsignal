import { localStorageAdapter } from "./localStorageAdapter";
import {
  applyFormMetadataOverlay,
  applyFormMetadataOverlays,
  clearFormMetadataOverlay,
} from "./formMetadataOverlay";
import { walrusAdapter } from "./walrusAdapter";
import type { FormSchema, StorageAdapter, Submission } from "../types";
import { WALRUS_AGGREGATOR_URL, WALRUS_UPLOAD_RELAY_URL } from "../lib/sui";

type RuntimeMode = "walrus" | "local-fallback";
type RuntimeStatus = { mode: RuntimeMode; notice: string | null };

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
};

function emitStatus(next: Partial<RuntimeStatus>) {
  runtimeStatus = { ...runtimeStatus, ...next };
  listeners.forEach((listener) => listener());
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
    emitStatus({ mode: "walrus", notice: null });
    return result;
  } catch (error) {
    console.error(error);
    if (requireWalrus) {
      emitStatus({
        mode: "walrus",
        notice: error instanceof Error ? error.message : "Walrus is required for this build.",
      });
      throw error;
    }
    emitStatus({
      mode: "local-fallback",
      notice: "Walrus upload failed. Saved locally instead.",
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
    if (!walrusRequested) {
      await localStorageAdapter.deleteForm(id);
      clearFormMetadataOverlay(id);
      return;
    }
    try {
      await walrusAdapter.deleteForm(id);
      await localStorageAdapter.deleteForm(id);
      clearFormMetadataOverlay(id);
      emitStatus({ mode: "walrus", notice: null });
    } catch (error) {
      console.error(error);
      emitStatus({
        mode: "walrus",
        notice: error instanceof Error ? error.message : "Walrus delete failed.",
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
