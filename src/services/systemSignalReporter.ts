import { buildInfo } from "../lib/buildInfo";
import { getChunkFailureUrl } from "../lib/chunkLoadRecovery";
import {
  getBrowserCapabilitiesSnapshot,
  getCurrentRoutePath,
  isMobileSafariLike,
  logRouteLifecycle,
  recordResourceErrorDiagnostic,
  recordRuntimeErrorDiagnostic,
  updateBrowserCapabilityDiagnostics,
} from "../lib/routeDiagnostics";
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

type NormalizedRuntimeError = {
  errorName: string;
  errorMessage: string;
  errorStack: string;
  chunkUrl: string | null;
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

function normalizeError(input: SystemSignalInput): NormalizedRuntimeError {
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
  const snapshot = getBrowserCapabilitiesSnapshot();
  if (typeof snapshot.userAgent === "string" && snapshot.userAgent === userAgent && typeof snapshot.mobileSafari === "boolean") {
    return snapshot.mobileSafari;
  }
  return isMobileSafariLike(
    userAgent,
    typeof navigator === "undefined" ? "" : navigator.platform || "",
    typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints ?? 0,
  );
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

function getProviderReadinessValue(key: string) {
  const snapshot = getProviderReadinessSnapshot();
  const value = snapshot[key];
  return typeof value === "string" ? value : String(value ?? "");
}

function providersLookReadyForDiagnosticOnly() {
  const wallet = getProviderReadinessValue("walletProvider");
  const walrus = getProviderReadinessValue("walrusRuntimeProvider");
  const routeGuard = getProviderReadinessValue("routeProviderGuard");
  return (
    (wallet === "ready" || wallet === "connected" || wallet === "deferred" || wallet === "") &&
    (walrus === "ready" || walrus === "deferred" || walrus === "") &&
    (routeGuard === "ready" || routeGuard === "deferred" || routeGuard === "")
  );
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

function safeString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack || value.message || value.name;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function safeEventDetails(event: Event) {
  const target = event.target as Partial<HTMLScriptElement & HTMLLinkElement & HTMLImageElement> | null;
  const currentTarget = event.currentTarget as Partial<EventTarget> | null;
  const tagName = typeof target?.tagName === "string" ? target.tagName : "";
  return {
    eventType: event.type,
    targetType: target?.constructor?.name ?? typeof target,
    currentTargetType: currentTarget?.constructor?.name ?? typeof currentTarget,
    tagName,
    src: typeof target?.src === "string" ? target.src : undefined,
    href: typeof target?.href === "string" ? target.href : undefined,
    rel: typeof target?.rel === "string" ? target.rel : undefined,
    as: typeof target?.as === "string" ? target.as : undefined,
    crossOrigin: typeof target?.crossOrigin === "string" ? target.crossOrigin : undefined,
    message: event instanceof ErrorEvent ? event.message : undefined,
    filename: event instanceof ErrorEvent ? event.filename : undefined,
    lineno: event instanceof ErrorEvent ? event.lineno : undefined,
    colno: event instanceof ErrorEvent ? event.colno : undefined,
  };
}

function isResourceErrorEvent(event: Event) {
  const target = event.target as Partial<HTMLScriptElement & HTMLLinkElement & HTMLImageElement> | null;
  const tagName = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : "";
  return tagName === "SCRIPT" || tagName === "LINK" || tagName === "IMG";
}

function isModulePreloadResourceError(details: ReturnType<typeof safeEventDetails>) {
  return String(details.tagName || "").toUpperCase() === "LINK" && details.rel === "modulepreload";
}

function isSameOriginAppAssetUrl(url: string | null | undefined) {
  if (!url || typeof window === "undefined") {
    return false;
  }
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith("/assets/");
  } catch {
    return false;
  }
}

function isOptionalExternalResourceUrl(url: string | null | undefined) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url, typeof window === "undefined" ? "https://deepsignal.invalid" : window.location.href);
    return parsed.hostname === "script.google.com" && parsed.pathname.includes("/macros/");
  } catch {
    return false;
  }
}

function classifyResourceError({
  modulePreloadOnly,
  resourceUrl,
  tagName,
}: {
  modulePreloadOnly: boolean;
  resourceUrl: string | null;
  tagName: string;
}) {
  const appAsset = isSameOriginAppAssetUrl(resourceUrl);
  const optionalExternal = isOptionalExternalResourceUrl(resourceUrl);
  if (optionalExternal) {
    return {
      appAsset,
      chunkUrl: null,
      classification: "optional_remote_sync_resource_error",
      errorName: "OptionalRemoteSyncResourceError",
      severity: "warning" as const,
      sourceContext: "resource.optional-remote-sync",
    };
  }
  return {
    appAsset,
    chunkUrl: appAsset && (tagName === "SCRIPT" || modulePreloadOnly) ? resourceUrl : null,
    classification: modulePreloadOnly ? "modulepreload_link_error" : appAsset ? "app_asset_resource_error" : "external_resource_error",
    errorName: modulePreloadOnly ? `${tagName}ModulePreloadResourceError` : `${tagName}ResourceError`,
    severity: modulePreloadOnly || !appAsset ? "warning" as const : tagName === "SCRIPT" ? "error" as const : "warning" as const,
    sourceContext: modulePreloadOnly ? "resource.modulepreload.preload-only" : "resource.error.capture",
  };
}

function normalizePromiseRejectionReason(reason: unknown): NormalizedRuntimeError {
  if (reason instanceof Error) {
    return {
      errorName: reason.name || "UnhandledRejection",
      errorMessage: reason.message || "Unhandled promise rejection.",
      errorStack: reason.stack || "",
      chunkUrl: getChunkFailureUrl(reason),
    };
  }
  const message = safeString(reason) || "Unhandled promise rejection.";
  return {
    errorName: typeof reason === "undefined" ? "UnhandledRejection" : "UnhandledRejectionNonError",
    errorMessage: message,
    errorStack: "",
    chunkUrl: getChunkFailureUrl(message),
  };
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
  updateBrowserCapabilityDiagnostics();

  window.addEventListener(
    "error",
    (event) => {
      if (!isResourceErrorEvent(event)) {
        return;
      }
      const details = safeEventDetails(event);
      const target = event.target as Partial<HTMLScriptElement & HTMLLinkElement & HTMLImageElement>;
      const tagName = String(details.tagName || "RESOURCE").toUpperCase();
      const modulePreloadOnly = isModulePreloadResourceError(details);
      const resourceUrl =
        tagName === "SCRIPT" && typeof target.src === "string"
          ? target.src
          : tagName === "LINK" && typeof target.href === "string"
            ? target.href
            : details.src || details.href || null;
      const resourceClassification = classifyResourceError({ modulePreloadOnly, resourceUrl, tagName });
      recordResourceErrorDiagnostic({
        sourceContext: resourceClassification.sourceContext,
        tagName,
        src: details.src,
        href: details.href,
        rel: details.rel,
        as: details.as,
        crossOrigin: details.crossOrigin,
        details,
      });
      logRouteLifecycle("resource:error", {
        tagName,
        src: details.src,
        href: details.href,
        rel: details.rel,
        as: details.as,
        appAsset: resourceClassification.appAsset,
        classification: resourceClassification.classification,
        preloadOnly: modulePreloadOnly,
        resourceUrl,
      });
      reportSystemError({
        errorName: resourceClassification.errorName,
        errorMessage:
          resourceClassification.classification === "optional_remote_sync_resource_error"
            ? `Optional remote sync resource failed to load: ${resourceUrl || tagName}`
            : `${modulePreloadOnly ? "Module preload" : "Resource"} failed to load: ${resourceUrl || tagName}`,
        errorStack: "",
        chunkUrl: resourceClassification.chunkUrl,
        severity: resourceClassification.severity,
        sourceContext: resourceClassification.sourceContext,
        diagnostics: {
          ...details,
          appAsset: resourceClassification.appAsset,
          classification: resourceClassification.classification,
          resourceUrl,
          preloadOnly: modulePreloadOnly,
          remoteSyncDegraded: resourceClassification.classification === "optional_remote_sync_resource_error",
          safariPreloadOnly: modulePreloadOnly && isMobileSafari(getUserAgent()),
        },
      });
    },
    true,
  );

  window.addEventListener("error", (event) => {
    if (isResourceErrorEvent(event)) {
      return;
    }
    const details = safeEventDetails(event);
    const normalized = normalizeError({
      error: event.error instanceof Error ? event.error : undefined,
      errorName: event.error instanceof Error ? event.error.name : "WindowError",
      errorMessage: event.message || "Unhandled window error.",
      errorStack: event.error instanceof Error ? event.error.stack : "",
      chunkUrl: typeof event.filename === "string" && event.filename.endsWith(".js") ? event.filename : null,
    });
    const isOpaqueScriptError =
      normalized.errorMessage === "Script error." &&
      !normalized.errorStack &&
      !normalized.chunkUrl &&
      !event.filename &&
      !event.lineno &&
      !event.colno;
    recordRuntimeErrorDiagnostic({
      sourceContext: isOpaqueScriptError ? "window.error.opaque-script-diagnostic" : "window.error",
      errorName: normalized.errorName,
      errorMessage: normalized.errorMessage,
      errorStack: normalized.errorStack,
      details: {
        ...details,
        diagnosticOnly: isOpaqueScriptError && providersLookReadyForDiagnosticOnly(),
        routePath: getCurrentRoutePath(),
      },
    });
    logRouteLifecycle(isOpaqueScriptError ? "window:error:opaque-script" : "window:error", {
      errorName: normalized.errorName,
      errorMessage: normalized.errorMessage,
      filename: details.filename,
      lineno: details.lineno,
      colno: details.colno,
      diagnosticOnly: isOpaqueScriptError && providersLookReadyForDiagnosticOnly(),
    });
    reportSystemError({
      error: event.error instanceof Error ? event.error : undefined,
      errorName: normalized.errorName,
      errorMessage: normalized.errorMessage,
      errorStack: normalized.errorStack,
      chunkUrl: normalized.chunkUrl,
      severity: isOpaqueScriptError && providersLookReadyForDiagnosticOnly() ? "warning" : "error",
      sourceContext: isOpaqueScriptError ? "window.error.opaque-script-diagnostic" : "window.error",
      diagnostics: {
        ...details,
        diagnosticOnly: isOpaqueScriptError && providersLookReadyForDiagnosticOnly(),
      },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const normalized = normalizePromiseRejectionReason(event.reason);
    recordRuntimeErrorDiagnostic({
      sourceContext: "window.unhandledrejection",
      errorName: normalized.errorName,
      errorMessage: normalized.errorMessage,
      errorStack: normalized.errorStack,
      details: {
        reasonType: event.reason?.constructor?.name ?? typeof event.reason,
        reason: safeString(event.reason).slice(0, 1000),
        routePath: getCurrentRoutePath(),
      },
    });
    logRouteLifecycle("window:unhandledrejection", {
      errorName: normalized.errorName,
      errorMessage: normalized.errorMessage,
      chunkUrl: normalized.chunkUrl,
    });
    reportSystemError({
      error: event.reason,
      errorName: normalized.errorName,
      errorMessage: normalized.errorMessage,
      errorStack: normalized.errorStack,
      chunkUrl: normalized.chunkUrl,
      severity: "error",
      sourceContext: "window.unhandledrejection",
      diagnostics: {
        reasonType: event.reason?.constructor?.name ?? typeof event.reason,
        reason: safeString(event.reason).slice(0, 1000),
      },
    });
  });
}
