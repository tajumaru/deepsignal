export type CriticalFailureKind =
  | "wallet_disconnected"
  | "wallet_rejected"
  | "network_mismatch"
  | "walrus_timeout"
  | "walrus_upload_failed"
  | "seal_failed"
  | "registry_failed"
  | "unknown";

export type CriticalFailureSurface = "wallet" | "walrus" | "seal" | "registry" | "form";

export interface CriticalFailureOptions {
  error: unknown;
  surface?: CriticalFailureSurface;
  step?: string;
  noDataSubmitted?: boolean;
  uploadSucceeded?: boolean;
  registryUpdated?: boolean;
  retryable?: boolean;
  occurredAt?: Date;
  diagnostics?: Record<string, unknown>;
}

export interface CriticalFailure {
  id: string;
  kind: CriticalFailureKind;
  surface: CriticalFailureSurface;
  step?: string;
  message: string;
  rawMessage: string;
  noDataSubmitted: boolean;
  uploadSucceeded: boolean;
  registryUpdated: boolean;
  retryable: boolean;
  diagnostics: Record<string, unknown>;
}

export function hasInconsistentPublishState(failure: Pick<CriticalFailure, "uploadSucceeded" | "registryUpdated">) {
  return failure.registryUpdated && !failure.uploadSucceeded;
}

function normalizeMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.trim() || error.name;
  }
  return String(error ?? "Unknown error");
}

function toDayStamp(date: Date) {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function hashSeed(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 4);
}

function getSurfaceToken(surface: CriticalFailureSurface) {
  switch (surface) {
    case "wallet":
      return "WALLET";
    case "seal":
      return "SEAL";
    case "registry":
      return "REGISTRY";
    case "form":
      return "FORM";
    default:
      return "WALRUS";
  }
}

function inferSurface(message: string, fallback: CriticalFailureSurface) {
  const lower = message.toLowerCase();
  if (lower.includes("seal") || lower.includes("encrypt")) {
    return "seal";
  }
  if (lower.includes("registry") || lower.includes("sui registration")) {
    return "registry";
  }
  if (lower.includes("wallet")) {
    return "wallet";
  }
  if (lower.includes("walrus") || lower.includes("blob")) {
    return "walrus";
  }
  return fallback;
}

function classifyKind(message: string, surface: CriticalFailureSurface): CriticalFailureKind {
  const lower = message.toLowerCase();
  if (
    lower.includes("connect wallet") ||
    lower.includes("connected wallet") ||
    lower.includes("wallet is not connected") ||
    lower.includes("wallet is not ready") ||
    lower.includes("wallet required")
  ) {
    return "wallet_disconnected";
  }
  if (
    (lower.includes("reject") || lower.includes("declin") || lower.includes("denied")) &&
    (lower.includes("wallet") || lower.includes("signature") || lower.includes("approval") || lower.includes("transaction"))
  ) {
    return "wallet_rejected";
  }
  if (
    lower.includes("incorrect password") ||
    lower.includes("wrong password") ||
    lower.includes("invalid password") ||
    lower.includes("password is incorrect") ||
    lower.includes("authentication failed")
  ) {
    return "wallet_rejected";
  }
  if (lower.includes("network mismatch") || lower.includes("wrong network")) {
    return "network_mismatch";
  }
  if (surface === "seal" || lower.includes("encryption failed") || lower.includes("seal adapter")) {
    return "seal_failed";
  }
  if (surface === "registry") {
    return "registry_failed";
  }
  if (lower.includes("timed out")) {
    return "walrus_timeout";
  }
  if (surface === "walrus" || lower.includes("walrus")) {
    return "walrus_upload_failed";
  }
  return "unknown";
}

export function createCriticalFailure({
  error,
  surface = "form",
  step,
  noDataSubmitted,
  uploadSucceeded = false,
  registryUpdated = false,
  retryable,
  occurredAt = new Date(),
  diagnostics = {},
}: CriticalFailureOptions): CriticalFailure {
  const rawMessage = normalizeMessage(error);
  const resolvedSurface = inferSurface(rawMessage, surface);
  const kind = classifyKind(rawMessage, resolvedSurface);
  const resolvedNoDataSubmitted =
    noDataSubmitted ??
    (kind === "wallet_rejected" ||
      kind === "wallet_disconnected" ||
      kind === "network_mismatch" ||
      kind === "seal_failed");
  const resolvedRetryable =
    retryable ??
    (kind === "wallet_rejected" ||
      kind === "wallet_disconnected" ||
      kind === "network_mismatch" ||
      kind === "walrus_timeout" ||
      kind === "walrus_upload_failed" ||
      kind === "registry_failed");
  const seed = [
    toDayStamp(occurredAt),
    resolvedSurface,
    kind,
    step ?? "",
    rawMessage.toLowerCase(),
    uploadSucceeded ? "upload_succeeded" : "upload_pending",
    registryUpdated ? "registry_updated" : "registry_pending",
  ].join("|");
  const id = `DS-${toDayStamp(occurredAt)}-${getSurfaceToken(resolvedSurface)}-${hashSeed(seed)}`;

  return {
    id,
    kind,
    surface: resolvedSurface,
    step,
    message: rawMessage,
    rawMessage,
    noDataSubmitted: resolvedNoDataSubmitted,
    uploadSucceeded,
    registryUpdated,
    retryable: resolvedRetryable,
    diagnostics,
  };
}

export function buildCriticalFailureDiagnostics(failure: CriticalFailure) {
  const lines = [
    `Error ID: ${failure.id}`,
    `Kind: ${failure.kind}`,
    `Surface: ${failure.surface}`,
    failure.step ? `Step: ${failure.step}` : null,
    `Message: ${failure.rawMessage}`,
    `No data submitted: ${failure.noDataSubmitted ? "yes" : "no"}`,
    `Upload succeeded: ${failure.uploadSucceeded ? "yes" : "no"}`,
    `Registry updated: ${failure.registryUpdated ? "yes" : "no"}`,
  ].filter((line): line is string => Boolean(line));

  for (const [key, value] of Object.entries(failure.diagnostics)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    lines.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }

  return lines.join("\n");
}
