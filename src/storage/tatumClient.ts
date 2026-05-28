import type { TatumStorageRecord, TatumStorageStatus } from "../types";

export type TatumStorageProvider = "tatum";
export type TatumUploadKind =
  | "form-bundle"
  | "submission-bundle"
  | "manifest"
  | "encrypted-payload"
  | "attachment";

export type TatumUploadStatus = TatumStorageRecord & {
  provider: TatumStorageProvider;
  status?: TatumStorageStatus;
  raw?: unknown;
};

export type TatumClientOptions = {
  baseUrl?: string;
  uploadTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
};

export type TatumStorageErrorDiagnostics = {
  provider: TatumStorageProvider;
  blobId?: string;
  cid?: string;
  jobId?: string;
  status?: string;
  httpStatus?: number;
  responseBody?: string;
};

export class TatumStorageClientError extends Error {
  diagnostics: TatumStorageErrorDiagnostics;

  constructor(message: string, diagnostics: TatumStorageErrorDiagnostics, cause?: unknown) {
    super(message);
    this.name = "TatumStorageClientError";
    this.diagnostics = diagnostics;
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: cause,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
  }
}

type TatumStorageResponse = {
  provider?: string;
  jobId?: string;
  blobId?: string;
  cid?: string;
  quiltId?: string;
  quiltPatchId?: string;
  fileId?: string;
  status?: string;
  downloadUrl?: string;
  downloadUrlByQuiltId?: string;
  downloadUrlByQuiltPatchId?: string;
  noRenewal?: boolean;
  raw?: unknown;
  result?: TatumStorageResponse;
  data?: TatumStorageResponse;
};

const DEFAULT_TATUM_STORAGE_RELAY_PATH = "/api/tatum/storage";
const DEFAULT_UPLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

function readEnv(name: keyof ImportMetaEnv) {
  return String(import.meta.env[name] ?? "").trim();
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function getConfiguredBaseUrl() {
  return normalizeBaseUrl(
    readEnv("VITE_TATUM_STORAGE_BASE_URL") ||
      readEnv("VITE_TATUM_STORAGE_PROXY_PATH") ||
      DEFAULT_TATUM_STORAGE_RELAY_PATH,
  );
}

function parsePositiveNumber(value: string, fallback: number, min: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

function getUploadTimeoutMs() {
  return parsePositiveNumber(
    readEnv("VITE_TATUM_STORAGE_UPLOAD_TIMEOUT_MS"),
    DEFAULT_UPLOAD_TIMEOUT_MS,
    15_000,
  );
}

function getPollIntervalMs() {
  return parsePositiveNumber(
    readEnv("VITE_TATUM_STORAGE_POLL_INTERVAL_MS"),
    DEFAULT_POLL_INTERVAL_MS,
    500,
  );
}

function isDirectTatumApiUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl, window.location.origin);
    return url.hostname === "api.tatum.io";
  } catch {
    return baseUrl.includes("api.tatum.io");
  }
}

function createUploadFile(body: Blob | File, kind: TatumUploadKind) {
  if (body instanceof File) {
    return body;
  }
  const extension = body.type === "text/plain" ? "txt" : "json";
  return new File([body], `${kind}.${extension}`, { type: body.type || "application/octet-stream" });
}

function getResponseSource(payload: TatumStorageResponse | null | undefined) {
  return payload?.result ?? payload?.data ?? payload ?? {};
}

function getPreferredDownloadUrl(payload: TatumStorageResponse | undefined) {
  const source = getResponseSource(payload);
  return (
    source.downloadUrl ??
    source.downloadUrlByQuiltId ??
    source.downloadUrlByQuiltPatchId ??
    payload?.downloadUrl ??
    payload?.downloadUrlByQuiltId ??
    payload?.downloadUrlByQuiltPatchId
  );
}

function normalizeStorageStatus(payload: TatumStorageResponse | null | undefined): TatumUploadStatus {
  const source = getResponseSource(payload);
  return {
    provider: "tatum",
    jobId: typeof source.jobId === "string" ? source.jobId : undefined,
    blobId: typeof source.blobId === "string" ? source.blobId : undefined,
    cid: typeof source.cid === "string" ? source.cid : undefined,
    quiltId: typeof source.quiltId === "string" ? source.quiltId : undefined,
    quiltPatchId: typeof source.quiltPatchId === "string" ? source.quiltPatchId : undefined,
    fileId: typeof source.fileId === "string" ? source.fileId : undefined,
    status: typeof source.status === "string" ? (source.status as TatumStorageStatus) : undefined,
    downloadUrl: getPreferredDownloadUrl(payload ?? undefined),
    noRenewal: typeof source.noRenewal === "boolean" ? source.noRenewal : undefined,
    raw: payload?.raw ?? payload,
  };
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as TatumStorageResponse;
  } catch {
    throw new Error(`Tatum storage relay returned a non-JSON response: ${text.slice(0, 200)}`);
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function createStorageError(message: string, payload?: unknown, status?: number) {
  const details = payload ? ` ${JSON.stringify(payload)}` : "";
  const normalized = normalizeStorageStatus(payload as TatumStorageResponse | null | undefined);
  return new TatumStorageClientError(`${message}${status ? ` (${status})` : ""}.${details}`, {
    provider: "tatum",
    blobId: normalized.blobId,
    cid: normalized.cid,
    jobId: normalized.jobId,
    status: normalized.status,
    httpStatus: status,
    responseBody: payload ? JSON.stringify(payload) : undefined,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isTatumStorageFeatureEnabled() {
  return readEnv("VITE_TATUM_STORAGE_ENABLED").toLowerCase() === "true";
}

export function hasBrowserExposedTatumApiKey() {
  return Boolean(readEnv("VITE_TATUM_API_KEY"));
}

export function getTatumStorageRelayBaseUrl() {
  if (!isTatumStorageFeatureEnabled()) {
    return null;
  }
  const baseUrl = getConfiguredBaseUrl();
  if (!baseUrl || isDirectTatumApiUrl(baseUrl) || hasBrowserExposedTatumApiKey()) {
    return null;
  }
  return baseUrl;
}

export function getTatumStorageSafetyDiagnostics() {
  const configuredBaseUrl = getConfiguredBaseUrl();
  const browserApiKeyConfigured = hasBrowserExposedTatumApiKey();
  const directApiUrlConfigured = isDirectTatumApiUrl(configuredBaseUrl);
  return {
    provider: "tatum" as const,
    enabled: isTatumStorageFeatureEnabled(),
    relayBaseUrl: getTatumStorageRelayBaseUrl(),
    browserApiKeyConfigured,
    directApiUrlConfigured,
    safeForBrowser: !browserApiKeyConfigured && !directApiUrlConfigured,
  };
}

export function createTatumStorageClient(options: TatumClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || getConfiguredBaseUrl());
  const uploadTimeoutMs = options.uploadTimeoutMs ?? getUploadTimeoutMs();
  const pollIntervalMs = options.pollIntervalMs ?? getPollIntervalMs();
  const fetchImpl = options.fetchImpl ?? fetch;

  function assertSafeRelayConfigured() {
    if (!isTatumStorageFeatureEnabled()) {
      throw new Error("Tatum storage is not enabled.");
    }
    if (hasBrowserExposedTatumApiKey()) {
      throw new Error("VITE_TATUM_API_KEY would expose the Tatum API key in the browser. Use TATUM_API_KEY in a relay/server instead.");
    }
    if (!baseUrl || isDirectTatumApiUrl(baseUrl)) {
      throw new Error("Tatum storage must be called through a relay/server URL, not directly from the browser.");
    }
  }

  async function request(path: string, init: RequestInit, timeoutMs: number) {
    assertSafeRelayConfigured();
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}${path}`, init, timeoutMs);
    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      throw createStorageError("Tatum storage relay request failed", payload, response.status);
    }
    return normalizeStorageStatus(payload);
  }

  return {
    uploadTimeoutMs,
    pollIntervalMs,
    async uploadFile(body: Blob | File, kind: TatumUploadKind) {
      const formData = new FormData();
      formData.append("file", createUploadFile(body, kind));
      return request(
        "/v4/data/storage/upload",
        {
          method: "POST",
          body: formData,
        },
        uploadTimeoutMs,
      );
    },
    async getUploadStatus(jobId: string) {
      return request(
        `/v4/data/storage/upload/${encodeURIComponent(jobId)}`,
        { method: "GET" },
        Math.min(uploadTimeoutMs, 30_000),
      );
    },
    async waitForCertification(initial: TatumUploadStatus) {
      const createdJobId = initial.jobId;
      const createdBlobId = initial.blobId;
      if (!createdJobId || !createdBlobId) {
        throw new Error("Tatum storage upload response did not include both jobId and blobId.");
      }

      let current = initial;
      const deadline = Date.now() + uploadTimeoutMs;
      while (Date.now() < deadline) {
        if (current.status === "CERTIFIED") {
          return {
            ...current,
            jobId: current.jobId ?? createdJobId,
            blobId: current.blobId ?? createdBlobId,
          };
        }
        if (current.status === "FAILED") {
          throw new TatumStorageClientError(`Tatum storage upload failed for job ${createdJobId}.`, {
            provider: "tatum",
            blobId: current.blobId ?? createdBlobId,
            cid: current.cid,
            jobId: createdJobId,
            status: current.status,
          });
        }
        await sleep(pollIntervalMs);
        current = {
          ...current,
          ...(await this.getUploadStatus(createdJobId)),
          jobId: createdJobId,
          blobId: current.blobId ?? createdBlobId,
        };
      }
      throw new TatumStorageClientError(`Tatum storage certification timed out for job ${createdJobId}.`, {
        provider: "tatum",
        blobId: current.blobId ?? createdBlobId,
        cid: current.cid,
        jobId: createdJobId,
        status: current.status,
      });
    },
    async cancelRenewal(jobId: string, options: { instant?: boolean } = {}) {
      const instant = options.instant === true ? "?instant=true" : "";
      return request(
        `/v4/data/storage/upload/${encodeURIComponent(jobId)}${instant}`,
        { method: "DELETE" },
        Math.min(uploadTimeoutMs, 30_000),
      );
    },
  };
}
