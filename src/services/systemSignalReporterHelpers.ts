import type { Submission } from "../types";
import { SYSTEM_SIGNAL_FORM_ID } from "./systemSignalReporterConstants";

export { SYSTEM_SIGNAL_FORM_ID };

type SystemSignalEnv = {
  VITE_REQUIRE_WALRUS?: string | boolean;
  VITE_STORAGE_MODE?: string;
  VITE_WALRUS_STORAGE_MODE?: string;
};

export function shouldAttemptSystemSignalRemoteSync(env: SystemSignalEnv = import.meta.env) {
  const walrusRequested = env.VITE_STORAGE_MODE === "walrus" || String(env.VITE_REQUIRE_WALRUS).toLowerCase() === "true";
  const walrusWriteMode = String(env.VITE_WALRUS_STORAGE_MODE || "uploadRelay").toLowerCase();
  return walrusRequested && walrusWriteMode === "tatum";
}

export function getSystemSignalDiagnostics(submission: Submission) {
  const diagnostics = submission.metadata?.systemDiagnostics;
  return diagnostics && typeof diagnostics === "object" ? (diagnostics as Record<string, unknown>) : null;
}

export function isSystemSignal(submission: Submission) {
  return submission.kind === "system_error" || submission.source === "deepsignal-runtime";
}

export async function copySystemSignalDiagnostics(submission: Submission) {
  const diagnostics = getSystemSignalDiagnostics(submission) ?? submission.metadata ?? submission;
  const text = JSON.stringify(diagnostics, null, 2);
  await navigator.clipboard.writeText(text);
}
