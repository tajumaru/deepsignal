import type { SealCompatibleClient } from "@mysten/seal";

type SuiRuntimeContext = {
  client: SealCompatibleClient | null;
  rpcUrl: string | null;
  network: string | null;
};

let runtimeContext: SuiRuntimeContext = {
  client: null,
  rpcUrl: null,
  network: null,
};

export function setSuiRuntimeContext(next: SuiRuntimeContext) {
  runtimeContext = next;
}

export function getSuiRuntimeContext() {
  return runtimeContext;
}
