import type { Submission } from "../types";
import type {
  DiagnosticsRemoteSyncStatus,
  SystemDiagnostic,
  SystemDiagnosticSeverity,
} from "./types";

const STACK_TRACE_LIMIT = 4000;
const SYSTEM_SOURCE = "deepsignal-runtime";
const SYSTEM_KIND = "system_error";

export function stripQueryAndHash(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    const [withoutHash] = trimmed.split("#");
    const [withoutQuery] = withoutHash.split("?");
    return withoutQuery || trimmed;
  }
}

function sanitizeEmbeddedUrls(value: string) {
  return value.replace(/https?:\/\/[^\s)'"]+/g, (match) => stripQueryAndHash(match));
}

function sanitizeDiagnosticText(value: string) {
  return sanitizeEmbeddedUrls(value)
    .replace(/\b(session|signature|signed[-_]?bytes|wallet[-_]?signature|encrypted[-_]?payload)[-_][A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/\b(session|signature|signed[-_]?bytes|wallet[-_]?signature|encrypted[-_]?payload)\s*[:=]\s*[^\s,;)]+/gi, "$1=[redacted]");
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  const text = safeString(value).trim();
  return text ? text : undefined;
}

function normalizeSeverity(value: unknown, fallback: unknown): SystemDiagnosticSeverity {
  if (value === "warning" || value === "error" || value === "critical") {
    return value;
  }
  if (fallback === "warning" || fallback === "error" || fallback === "critical") {
    return fallback;
  }
  return "error";
}

function normalizeRemoteSyncStatus(value: unknown): DiagnosticsRemoteSyncStatus | undefined {
  if (value === "remote_synced" || value === "sync_pending" || value === "local_only") {
    return value;
  }
  return undefined;
}

function readSystemDiagnostics(submission: Submission) {
  const diagnostics = submission.metadata?.systemDiagnostics;
  return diagnostics && typeof diagnostics === "object"
    ? diagnostics as Record<string, unknown>
    : {};
}

function isSystemSignalSubmission(submission: Submission) {
  return submission.kind === SYSTEM_KIND || submission.source === SYSTEM_SOURCE;
}

export function redactSystemSignal(
  submission: Submission,
  options: { includeStackTraces?: boolean } = {},
): SystemDiagnostic | null {
  if (!isSystemSignalSubmission(submission)) {
    return null;
  }

  const diagnostics = readSystemDiagnostics(submission);
  const severity = normalizeSeverity(submission.systemSeverity, diagnostics.severity ?? submission.severity);
  const routePath = stripQueryAndHash(
    safeString(diagnostics.routePath) ||
      safeString(diagnostics.pathname) ||
      "/",
  ) || "/";
  const pathname = optionalString(diagnostics.pathname);
  const errorName = optionalString(diagnostics.errorName) ?? submission.subjectPreview ?? "SystemError";
  const errorMessage = optionalString(diagnostics.errorMessage) ?? submission.aiSummary ?? "DeepSignal runtime alert.";
  // Stack traces are the largest diagnostics export attack surface: they can
  // contain SDK error bodies, route params, object dumps, and local paths.
  // Keep them disabled by default and sanitize before returning them.
  const errorStack = options.includeStackTraces
    ? sanitizeDiagnosticText(safeString(diagnostics.errorStack)).slice(0, STACK_TRACE_LIMIT) || undefined
    : undefined;

  return {
    id: submission.id,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    severity,
    fingerprint: optionalString(diagnostics.fingerprint) ?? submission.id,
    source: SYSTEM_SOURCE,
    sourceContext: optionalString(diagnostics.sourceContext),
    errorName,
    errorMessage: sanitizeDiagnosticText(errorMessage),
    errorStack,
    routeId: optionalString(diagnostics.routeId) ?? "unknown",
    routePath,
    pathname: pathname ? stripQueryAndHash(pathname) : undefined,
    chunkUrl: diagnostics.chunkUrl === null
      ? null
      : optionalString(diagnostics.chunkUrl)
        ? stripQueryAndHash(String(diagnostics.chunkUrl))
        : undefined,
    buildVersion: optionalString(diagnostics.buildVersion),
    buildTime: optionalString(diagnostics.buildTime),
    gitHash: optionalString(diagnostics.gitHash),
    platform: optionalString(diagnostics.platform),
    mobileSafari: typeof diagnostics.mobileSafari === "boolean" ? diagnostics.mobileSafari : undefined,
    walrusStorageMode: optionalString(diagnostics.walrusStorageMode),
    remoteSyncStatus: normalizeRemoteSyncStatus(submission.remoteSyncStatus),
  };
}

export function redactSystemSignals(
  submissions: Submission[],
  options: { includeStackTraces?: boolean } = {},
) {
  return submissions
    .map((submission) => redactSystemSignal(submission, options))
    .filter((diagnostic): diagnostic is SystemDiagnostic => diagnostic !== null);
}
