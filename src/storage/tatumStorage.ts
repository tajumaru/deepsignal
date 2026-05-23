import { SUI_NETWORK } from "../lib/sui";
import type { TatumStorageRecord, TatumStorageStatus, WalrusBlobProof } from "../types";
import { createWalrusBlobProof } from "../lib/walrusProof";

const TATUM_STORAGE_ENABLED = String(import.meta.env.NEXT_PUBLIC_TATUM_STORAGE_ENABLED || "").toLowerCase() === "true";
const TATUM_STORAGE_API_URL = (import.meta.env.VITE_TATUM_STORAGE_API_URL || "https://api.tatum.io").replace(/\/$/, "");
const TATUM_STORAGE_PROXY_ENABLED = import.meta.env.VITE_TATUM_STORAGE_PROXY_ENABLED === "true";
const TATUM_STORAGE_PROXY_PATH = import.meta.env.VITE_TATUM_STORAGE_PROXY_PATH || "/api/tatum/storage";
const TATUM_STORAGE_UPLOAD_TIMEOUT_MS = Math.max(
  15_000,
  Number(import.meta.env.VITE_TATUM_STORAGE_UPLOAD_TIMEOUT_MS || "120000"),
);
const TATUM_STORAGE_POLL_INTERVAL_MS = Math.max(
  500,
  Number(import.meta.env.VITE_TATUM_STORAGE_POLL_INTERVAL_MS || "2000"),
);

type TatumUploadKind =
  | "form-bundle"
  | "submission-bundle"
  | "manifest"
  | "encrypted-payload"
  | "attachment";

type TatumUploadResponse = {
  jobId?: string;
  blobId?: string;
  fileId?: string;
  status?: string;
  downloadUrl?: string;
  downloadUrlByQuiltId?: string;
  downloadUrlByQuiltPatchId?: string;
  result?: TatumUploadResponse;
  data?: TatumUploadResponse;
};

export type TatumUploadResult = {
  blobId: string;
  tatumStorage: TatumStorageRecord;
  walrusProof: WalrusBlobProof;
};

function getTatumStorageBaseUrl() {
  if (!TATUM_STORAGE_ENABLED) {
    return null;
  }
  return TATUM_STORAGE_PROXY_ENABLED ? TATUM_STORAGE_PROXY_PATH.replace(/\/$/, "") : TATUM_STORAGE_API_URL;
}

function getPreferredDownloadUrl(payload: TatumUploadResponse | undefined) {
  return (
    payload?.downloadUrl ??
    payload?.downloadUrlByQuiltId ??
    payload?.downloadUrlByQuiltPatchId ??
    payload?.result?.downloadUrl ??
    payload?.result?.downloadUrlByQuiltId ??
    payload?.result?.downloadUrlByQuiltPatchId ??
    payload?.data?.downloadUrl ??
    payload?.data?.downloadUrlByQuiltId ??
    payload?.data?.downloadUrlByQuiltPatchId
  );
}

function getUploadRecord(payload: TatumUploadResponse | null | undefined): TatumStorageRecord {
  const source = payload?.result ?? payload?.data ?? payload ?? {};
  return {
    jobId: typeof source.jobId === "string" ? source.jobId : undefined,
    blobId: typeof source.blobId === "string" ? source.blobId : undefined,
    fileId: typeof source.fileId === "string" ? source.fileId : undefined,
    status: typeof source.status === "string" ? (source.status as TatumStorageStatus) : undefined,
    downloadUrl: getPreferredDownloadUrl(payload ?? undefined),
  };
}

function assertConfiguredBaseUrl() {
  const baseUrl = getTatumStorageBaseUrl();
  if (!baseUrl) {
    throw new Error("Tatum storage is not enabled.");
  }
  return baseUrl;
}

function createUploadFile(body: Blob | File, kind: TatumUploadKind) {
  if (body instanceof File) {
    return body;
  }
  const extension = body.type === "text/plain" ? "txt" : "json";
  return new File([body], `${kind}.${extension}`, { type: body.type || "application/octet-stream" });
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as TatumUploadResponse;
  } catch {
    throw new Error(`Tatum storage returned a non-JSON response: ${text.slice(0, 200)}`);
  }
}

async function fetchJsonWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function createStorageError(message: string, payload?: unknown, status?: number) {
  const details = payload ? ` ${JSON.stringify(payload)}` : "";
  return new Error(`${message}${status ? ` (${status})` : ""}.${details}`);
}

async function postUpload(body: Blob | File, kind: TatumUploadKind) {
  const baseUrl = assertConfiguredBaseUrl();
  const formData = new FormData();
  formData.append("file", createUploadFile(body, kind));
  const response = await fetchJsonWithTimeout(
    `${baseUrl}/v4/data/storage/upload`,
    {
      method: "POST",
      body: formData,
    },
    TATUM_STORAGE_UPLOAD_TIMEOUT_MS,
  );
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw createStorageError("Tatum storage upload failed", payload, response.status);
  }
  return getUploadRecord(payload);
}

async function getUploadStatus(jobId: string) {
  const baseUrl = assertConfiguredBaseUrl();
  const response = await fetchJsonWithTimeout(
    `${baseUrl}/v4/data/storage/upload/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
    },
    Math.min(TATUM_STORAGE_UPLOAD_TIMEOUT_MS, 30_000),
  );
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw createStorageError("Tatum storage status lookup failed", payload, response.status);
  }
  return getUploadRecord(payload);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isTatumStorageEnabled() {
  return TATUM_STORAGE_ENABLED;
}

export function getTatumStorageWriteUrl() {
  return getTatumStorageBaseUrl();
}

export async function uploadWithTatum(body: Blob | File, kind: TatumUploadKind): Promise<TatumUploadResult> {
  const created = await postUpload(body, kind);
  const createdJobId = created.jobId;
  const createdBlobId = created.blobId;
  if (!createdJobId || !createdBlobId) {
    throw new Error("Tatum storage upload response did not include both jobId and blobId.");
  }

  let current = created;
  const deadline = Date.now() + TATUM_STORAGE_UPLOAD_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (current.status === "CERTIFIED") {
      const certifiedBlobId = current.blobId ?? createdBlobId;
      return {
        blobId: certifiedBlobId,
        tatumStorage: {
          ...current,
          jobId: current.jobId ?? createdJobId,
          blobId: certifiedBlobId,
        },
        walrusProof: createWalrusBlobProof({
          blobId: certifiedBlobId,
          size: body.size,
          epoch: Number(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS || "5"),
          network: SUI_NETWORK,
        }),
      };
    }

    if (current.status === "FAILED") {
      throw new Error(`Tatum storage upload failed for job ${createdJobId}.`);
    }

    await sleep(TATUM_STORAGE_POLL_INTERVAL_MS);
    current = {
      ...current,
      ...(await getUploadStatus(createdJobId)),
      jobId: createdJobId,
      blobId: current.blobId || createdBlobId,
    };
  }

  throw new Error(`Tatum storage certification timed out for job ${createdJobId}.`);
}
