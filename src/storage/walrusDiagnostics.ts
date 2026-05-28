export type WalrusFailureStage =
  | "rpc-visibility"
  | "transaction-execution"
  | "upload-relay"
  | "certification"
  | "wallet-balance"
  | "unknown";

export interface WalrusFailureDetails {
  provider?: "walrus" | "tatum";
  stage: WalrusFailureStage;
  digest?: string;
  blobId?: string;
  cid?: string;
  jobId?: string;
  uploadStatus?: string;
  lastRpcError?: string;
  timeoutMs?: number;
  category?: "quota_exceeded" | "rate_limited" | "storage_unavailable";
  source?: "upload-relay" | "rpc" | "walrus-sdk" | "browser-storage" | "tatum" | "unknown";
  status?: number;
  errorName?: string;
  causeMessage?: string;
  url?: string;
  responseBody?: string;
}

export class WalrusDiagnosticError extends Error {
  details: WalrusFailureDetails;

  constructor(message: string, details: WalrusFailureDetails, cause?: unknown) {
    super(message);
    this.name = "WalrusDiagnosticError";
    this.details = details;
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

export function isWalrusDiagnosticError(error: unknown): error is WalrusDiagnosticError {
  return error instanceof WalrusDiagnosticError;
}

export function getWalrusErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.trim() || error.name;
  }
  return String(error);
}

export function isQuotaExceededError(error: unknown) {
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22)) {
    return true;
  }
  if (error instanceof Error && error.name === "QuotaExceededError") {
    return true;
  }
  const message = getWalrusErrorMessage(error).toLowerCase();
  return (
    message.includes("dom exception 22") ||
    message.includes("domexception 22") ||
    message.includes("quota exceeded") ||
    message.includes("quota has been exceeded") ||
    message.includes("storage quota") ||
    message.includes("webkit storage") ||
    message.includes("safari storage") ||
    message.includes("exceeded the quota")
  );
}

export function isRateLimitError(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 429) {
    return true;
  }
  const message = getWalrusErrorMessage(error).toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("status 429") ||
    message.includes("status code: 429") ||
    message.includes("unexpected status code: 429")
  );
}

export function getWalrusErrorStatus(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  return typeof status === "number" ? status : undefined;
}

export function getWalrusErrorUrl(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const url = "url" in error ? (error as { url?: unknown }).url : undefined;
  return typeof url === "string" && url.trim() ? url : undefined;
}

export function getWalrusCauseMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("cause" in error)) {
    return undefined;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || cause === error) {
    return undefined;
  }
  return getWalrusErrorMessage(cause);
}

export function getWalrusErrorResponseBody(error: unknown) {
  if (!error || typeof error !== "object" || !("error" in error)) {
    return undefined;
  }
  const responseBody = (error as { error?: unknown }).error;
  if (responseBody === undefined) {
    return undefined;
  }
  if (typeof responseBody === "string") {
    return responseBody.trim() || undefined;
  }
  try {
    return JSON.stringify(responseBody);
  } catch {
    return String(responseBody);
  }
}

export function formatWalrusFailureStage(stage: WalrusFailureStage) {
  switch (stage) {
    case "rpc-visibility":
      return "RPC visibility wait";
    case "transaction-execution":
      return "Transaction failed";
    case "upload-relay":
      return "Upload relay failed";
    case "certification":
      return "Certification failed";
    case "wallet-balance":
      return "Wallet balance issue";
    default:
      return "Unknown failure";
  }
}
