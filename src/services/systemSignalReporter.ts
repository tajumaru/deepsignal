import { buildInfo } from "../lib/buildInfo";
import { getChunkFailureUrl } from "../lib/chunkLoadRecovery";
import type { FormSchema, Submission, SystemSignalSeverity } from "../types";

export const SYSTEM_SIGNAL_FORM_ID = "system:deepsignal-runtime";
const DEDUPE_PREFIX = "deepsignal.systemSignalReporter.dedupe.";
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;
const MAX_STACK_LENGTH = 5000;

type SystemSignalEnv = {
  VITE_REQUIRE_WALRUS?: string | boolean;
  VITE_STORAGE_MODE?: string;
  VITE_WALRUS_STORAGE_MODE?: string;
};

type SystemSignalInput = {
  error?: unknown;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  routePath?: string;
  routeId?: string;
  chunkUrl?: string | null;
  severity?: SystemSignalSeverity;
  sourceContext?: string;
  diagnostics?: Record<string, unknown>;
};

function safeGetLocation() {
  if (typeof window === "undefined") {
    return { pathname: "", hash: "", routePath: "" };
  }
  return {
    pathname: window.location.pathname,
    hash: window.location.hash,
    routePath: window.location.hash?.replace(/^#/, "") || `${window.location.pathname}${window.location.search}`,
  };
}

function getRouteId(routePath: string) {
  const pathname = routePath.split(/[?#]/)[0] || "/";
  if (pathname === "/" || pathname === "") return "landing";
  if (pathname.startsWith("/f/")) return "public-form";
  if (pathname === "/admin" || pathname === "/dashboard" || pathname.startsWith("/admin/") || pathname.startsWith("/dashboard/")) return "admin";
  if (pathname === "/create" || pathname === "/compose") return "create-signal";
  if (pathname === "/explore" || pathname === "/signals") return "explore";
  if (pathname.startsWith("/m/")) return "manifest-restore";
  if (pathname.startsWith("/roadmap/")) return "public-roadmap";
  return pathname.replace(/^\/+/, "") || "unknown";
}

function normalizeError(input: SystemSignalInput) {
  const error = input.error;
  if (error instanceof Error) {
    return {
      errorName: input.errorName || error.name || "Error",
      errorMessage: input.errorMessage || error.message || "Unknown runtime error.",
      errorStack: input.errorStack || error.stack || "",
      chunkUrl: input.chunkUrl ?? getChunkFailureUrl(error),
    };
  }
  return {
    errorName: input.errorName || (error ? typeof error : "Error"),
    errorMessage: input.errorMessage || (error ? String(error) : "Unknown runtime error."),
    errorStack: input.errorStack || "",
    chunkUrl: input.chunkUrl ?? null,
  };
}

function isMobileSafari(userAgent: string) {
  return /iP(?:hone|ad|od)/.test(userAgent) && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(userAgent);
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
}

function readDedupe(fingerprint: string) {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const key = `${DEDUPE_PREFIX}${fingerprint}`;
    const last = Number(window.localStorage.getItem(key) || 0);
    const now = Date.now();
    if (Number.isFinite(last) && now - last < DEDUPE_WINDOW_MS) {
      return true;
    }
    window.localStorage.setItem(key, String(now));
    return false;
  } catch {
    return false;
  }
}

function readSelectedProjectId() {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    const direct = window.localStorage.getItem("deepsignal.projectRegistry.selectedProjectId");
    if (direct) {
      return direct;
    }
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("deepsignal.projectRegistry.selectedProjectId:")) {
        return window.localStorage.getItem(key) || "";
      }
    }
  } catch {
    // Diagnostics are best effort only.
  }
  return "";
}

function getProviderReadinessSnapshot() {
  if (typeof window === "undefined") {
    return {};
  }
  return window.__DEEPSIGNAL_DEBUG__?.providerReadiness ?? {};
}

function getPlatform() {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  return navigator.platform || "unknown";
}

function getUserAgent() {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  return navigator.userAgent || "unknown";
}

function createSystemForm(timestamp: string): FormSchema {
  return {
    id: SYSTEM_SIGNAL_FORM_ID,
    title: "DeepSignal System Alerts",
    description: "Runtime, route, storage, and encryption failures reported by DeepSignal itself.",
    fields: [
      {
        id: "diagnostics",
        type: "markdown",
        label: "Diagnostics JSON",
        required: false,
        sensitive: false,
      },
    ],
    sections: [],
    purpose: "bug",
    analysisProfileId: "incident_report",
    signalType: "incident",
    analystType: "operations",
    analysisType: "anomaly",
    visibility: "private",
    identityPolicy: "anonymous_allowed",
    processingMode: "review_required",
    createdAt: timestamp,
    updatedAt: timestamp,
    creationMode: "admin",
    projectId: readSelectedProjectId() || undefined,
  };
}

export function shouldAttemptSystemSignalRemoteSync(env: SystemSignalEnv = import.meta.env) {
  const walrusRequested = env.VITE_STORAGE_MODE === "walrus" || String(env.VITE_REQUIRE_WALRUS).toLowerCase() === "true";
  const walrusWriteMode = String(env.VITE_WALRUS_STORAGE_MODE || "uploadRelay").toLowerCase();
  return walrusRequested && walrusWriteMode === "tatum";
}

export function getSystemSignalDiagnostics(submission: Submission) {
  const diagnostics = submission.metadata?.systemDiagnostics;
  return diagnostics && typeof diagnostics === "object" ? diagnostics as Record<string, unknown> : null;
}

export function isSystemSignal(submission: Submission) {
  return submission.kind === "system_error" || submission.source === "deepsignal-runtime";
}

export async function copySystemSignalDiagnostics(submission: Submission) {
  const diagnostics = getSystemSignalDiagnostics(submission) ?? submission.metadata ?? submission;
  const text = JSON.stringify(diagnostics, null, 2);
  await navigator.clipboard.writeText(text);
}

export function reportSystemError(input: SystemSignalInput) {
  if (typeof window === "undefined") {
    return;
  }
  window.setTimeout(() => {
    void persistSystemError(input);
  }, 0);
}

async function persistSystemError(input: SystemSignalInput) {
  try {
    const [{ localStorageAdapter }, storageFactory] = await Promise.all([
      import("../storage/localStorageAdapter"),
      import("../storage/storageFactory"),
    ]);
    const normalizedError = normalizeError(input);
    const location = safeGetLocation();
    const routePath = input.routePath || location.routePath || "/";
    const routeId = input.routeId || getRouteId(routePath);
    const timestamp = new Date().toISOString();
    const userAgent = getUserAgent();
    const storageRuntime = storageFactory.getStorageRuntimeStatus();
    const severity = input.severity ?? (normalizedError.chunkUrl ? "critical" : "error");
    const fingerprint = hashText(
      [
        normalizedError.errorName,
        normalizedError.errorMessage,
        routeId,
        routePath.split("?")[0],
        normalizedError.chunkUrl ?? "",
        buildInfo.appVersion,
        buildInfo.buildTime,
      ].join("|"),
    );

    if (readDedupe(fingerprint)) {
      return;
    }

    const diagnostics = {
      kind: "system_error",
      source: "deepsignal-runtime",
      severity,
      fingerprint,
      sourceContext: input.sourceContext,
      errorName: normalizedError.errorName,
      errorMessage: normalizedError.errorMessage,
      errorStack: normalizedError.errorStack.slice(0, MAX_STACK_LENGTH),
      routePath,
      routeId,
      pathname: location.pathname,
      hash: location.hash,
      chunkUrl: normalizedError.chunkUrl,
      buildVersion: buildInfo.appVersion,
      buildTime: buildInfo.buildTime,
      gitHash: buildInfo.gitHash,
      userAgent,
      platform: getPlatform(),
      mobileSafari: isMobileSafari(userAgent),
      timestamp,
      walletProviderReadiness: getProviderReadinessSnapshot(),
      walrusStorageMode: import.meta.env.VITE_WALRUS_STORAGE_MODE || import.meta.env.VITE_STORAGE_MODE || "local-fallback",
      walrusReadiness: storageRuntime,
      selectedProjectId: readSelectedProjectId() || null,
      ...(input.diagnostics ?? {}),
    };

    const systemForm = createSystemForm(timestamp);
    const systemSubmission: Submission = {
      id: `system-${fingerprint}-${Date.now().toString(36)}`,
      formId: SYSTEM_SIGNAL_FORM_ID,
      projectId: diagnostics.selectedProjectId || undefined,
      kind: "system_error",
      source: "deepsignal-runtime",
      systemSeverity: severity,
      answers: {
        diagnostics: JSON.stringify(diagnostics, null, 2),
      },
      attachments: [],
      metadata: {
        systemDiagnostics: diagnostics,
      },
      category: "bug",
      aiSummary: `${normalizedError.errorName}: ${normalizedError.errorMessage}`,
      severity,
      keywords: [
        "system",
        "runtime",
        routeId,
        ...(diagnostics.mobileSafari ? ["Mobile Safari"] : []),
        ...(normalizedError.chunkUrl ? ["chunk failure"] : []),
      ],
      clusterId: diagnostics.mobileSafari ? "Mobile Safari runtime" : "DeepSignal runtime",
      status: "unread",
      priority: severity === "warning" ? "medium" : "high",
      triageStatus: "new",
      reviewState: "queued",
      visibilityState: "private",
      insightEligibility: "metadata_only",
      tags: ["system", severity, routeId, ...(diagnostics.mobileSafari ? ["mobile-safari"] : [])],
      notes: "",
      isEncrypted: false,
      subjectPreview: normalizedError.errorName,
      createdAt: timestamp,
      updatedAt: timestamp,
      remoteSyncStatus: "local_only",
      deliveryStatus: "stored_local",
      deliveryStatuses: ["stored_local"],
    };

    await localStorageAdapter.saveForm(systemForm);
    await localStorageAdapter.saveSubmission(systemSubmission);
    await attemptSystemSignalRemoteSync(systemForm, systemSubmission);
  } catch {
    // System reporting must never make the user experience worse.
  }
}

async function attemptSystemSignalRemoteSync(systemForm: FormSchema, systemSubmission: Submission) {
  if (!shouldAttemptSystemSignalRemoteSync()) {
    return;
  }
  try {
    const [{ localStorageAdapter }, { walrusAdapter }] = await Promise.all([
      import("../storage/localStorageAdapter"),
      import("../storage/walrusAdapter"),
    ]);
    const formResult = await walrusAdapter.saveForm(systemForm);
    if (formResult.blobId || formResult.manifestBlobId || formResult.tatumStorage) {
      await localStorageAdapter.saveForm({
        ...systemForm,
        blobId: formResult.blobId,
        manifestBlobId: formResult.manifestBlobId,
        tatumStorage: formResult.tatumStorage,
      });
    }
    const submissionResult = await walrusAdapter.saveSubmission(systemSubmission);
    await localStorageAdapter.updateSubmission({
      ...systemSubmission,
      blobId: submissionResult.blobId,
      answerBlobId: submissionResult.answerBlobId,
      remoteIndexBlobId: submissionResult.remoteIndexBlobId,
      remoteIndexTarget: submissionResult.remoteIndexTarget,
      remoteIndexUpdated: submissionResult.remoteIndexUpdated,
      remoteIndexReadBack: submissionResult.remoteIndexReadBack,
      ownerReadable: submissionResult.ownerReadable,
      remoteSyncStatus: submissionResult.remoteSyncStatus ?? "remote_synced",
      walrusProof: submissionResult.walrusProof,
      tatumStorage: submissionResult.tatumStorage,
      deliveryStatus: "stored_walrus",
      deliveryStatuses: ["stored_local", "stored_walrus"],
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // Remote reporting is best effort; the local alert is already stored.
  }
}

export function startSystemSignalReporter() {
  if (typeof window === "undefined") {
    return;
  }
  window.addEventListener("error", (event) => {
    reportSystemError({
      error: event.error instanceof Error ? event.error : undefined,
      errorName: event.error instanceof Error ? event.error.name : "WindowError",
      errorMessage: event.message,
      errorStack: event.error instanceof Error ? event.error.stack : "",
      chunkUrl: typeof event.filename === "string" && event.filename.endsWith(".js") ? event.filename : null,
      severity: "error",
      sourceContext: "window.error",
      diagnostics: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportSystemError({
      error: event.reason,
      severity: "error",
      sourceContext: "window.unhandledrejection",
    });
  });
}
