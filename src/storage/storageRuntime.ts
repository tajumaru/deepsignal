import type { WalrusFailureDetails } from "./walrusDiagnostics";

export type RuntimeMode = "walrus" | "local-fallback";

export type RuntimeStatus = {
  mode: RuntimeMode;
  notice: string | null;
  diagnostics: WalrusFailureDetails | null;
};

const listeners = new Set<() => void>();

let runtimeStatus: RuntimeStatus = {
  mode: "local-fallback",
  notice: null,
  diagnostics: null,
};

export function setStorageRuntimeStatus(next: Partial<RuntimeStatus>) {
  runtimeStatus = { ...runtimeStatus, ...next };
  listeners.forEach((listener) => listener());
}

export function replaceStorageRuntimeStatus(next: RuntimeStatus) {
  runtimeStatus = next;
  listeners.forEach((listener) => listener());
}

export function getStorageRuntimeStatus() {
  return runtimeStatus;
}

export function subscribeStorageRuntime(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
