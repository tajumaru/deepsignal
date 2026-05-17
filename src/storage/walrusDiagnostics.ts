export type WalrusFailureStage =
  | "rpc-visibility"
  | "transaction-execution"
  | "upload-relay"
  | "certification"
  | "wallet-balance"
  | "unknown";

export interface WalrusFailureDetails {
  stage: WalrusFailureStage;
  digest?: string;
  lastRpcError?: string;
  timeoutMs?: number;
  category?: "quota_exceeded" | "rate_limited" | "storage_unavailable";
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
  if (error instanceof Error && error.name === "QuotaExceededError") {
    return true;
  }
  const message = getWalrusErrorMessage(error).toLowerCase();
  return (
    message.includes("quota exceeded") ||
    message.includes("quota has been exceeded") ||
    message.includes("storage quota") ||
    message.includes("exceeded the quota")
  );
}

export function isRateLimitError(error: unknown) {
  const message = getWalrusErrorMessage(error).toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests") || message.includes("status 429");
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
