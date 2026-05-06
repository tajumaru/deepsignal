import { localStorageAdapter } from "./localStorageAdapter";
import { walrusAdapter } from "./walrusAdapter";
import type { FormSchema, StorageAdapter, Submission } from "../types";

type RuntimeMode = "walrus" | "local-fallback";
type RuntimeStatus = { mode: RuntimeMode; notice: string | null };

const listeners = new Set<() => void>();

const walrusConfigured =
  import.meta.env.VITE_STORAGE_MODE === "walrus" &&
  Boolean(import.meta.env.VITE_WALRUS_PUBLISHER_URL) &&
  Boolean(import.meta.env.VITE_WALRUS_AGGREGATOR_URL);

let runtimeStatus: RuntimeStatus = {
  mode: walrusConfigured ? "walrus" : "local-fallback",
  notice: null,
};

function emitStatus(next: Partial<RuntimeStatus>) {
  runtimeStatus = { ...runtimeStatus, ...next };
  listeners.forEach((listener) => listener());
}

async function swallow<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
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
      return walrus;
    }
    return localStorageAdapter.getForm(id);
  },
  async listForms() {
    const [walrusForms, localForms] = await Promise.all([
      swallow(() => walrusAdapter.listForms(), [] as FormSchema[]),
      localStorageAdapter.listForms(),
    ]);
    return mergeById(walrusForms, localForms);
  },
  async deleteForm(id) {
    await Promise.all([
      swallow(() => walrusAdapter.deleteForm(id), undefined),
      localStorageAdapter.deleteForm(id),
    ]);
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

export const storage: StorageAdapter = walrusConfigured ? hybridWalrusStorage : localStorageAdapter;

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
