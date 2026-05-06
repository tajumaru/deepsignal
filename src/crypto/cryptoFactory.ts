import type { SealAdapter } from "../types";
import { localSealMock } from "./localSealMock";
import { sealClientAdapter } from "./sealClientAdapter";

export type SealRuntimeMode = "mock" | "seal";

interface SealRuntimeStatus {
  requestedMode: SealRuntimeMode;
  activeMode: SealRuntimeMode;
  isFallback: boolean;
  warning: string | null;
}

const requestedMode: SealRuntimeMode =
  import.meta.env.VITE_SEAL_MODE === "seal" ? "seal" : "mock";

const hasSealEnv =
  Boolean(import.meta.env.VITE_SEAL_PACKAGE_ID) &&
  Boolean(import.meta.env.VITE_SEAL_KEY_SERVER_OBJECT_ID) &&
  Boolean(import.meta.env.VITE_SEAL_AGGREGATOR_URL);

const warning =
  requestedMode === "seal" && !hasSealEnv
    ? "VITE_SEAL_MODE=seal was requested, but the Seal package, key server, or aggregator env is missing. Falling back to mock mode."
    : null;

if (warning) {
  console.warn(warning);
}

const activeMode: SealRuntimeMode =
  requestedMode === "seal" && hasSealEnv ? "seal" : "mock";

export const cryptoAdapter: SealAdapter =
  activeMode === "seal" ? sealClientAdapter : localSealMock;

const runtimeStatus: SealRuntimeStatus = {
  requestedMode,
  activeMode,
  isFallback: requestedMode === "seal" && activeMode === "mock",
  warning,
};

export function getSealRuntimeStatus() {
  return runtimeStatus;
}
