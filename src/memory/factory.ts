import { noopMemoryAdapter } from "./noopMemoryAdapter";
import type { MemoryAdapter } from "./types";

type MemoryFeatureEnv = Pick<ImportMetaEnv, "VITE_MEMWAL_ENABLED">;

export function isMemWalEnabled(env: MemoryFeatureEnv = import.meta.env) {
  return String(env.VITE_MEMWAL_ENABLED || "").toLowerCase() === "true";
}

export function getMemoryAdapter(env: MemoryFeatureEnv = import.meta.env): MemoryAdapter {
  void isMemWalEnabled(env);
  return noopMemoryAdapter;
}
