import { MemWalSignalMemoryAdapter } from "./memwalSignalMemoryAdapter";
import { noopSignalMemoryAdapter } from "./noopSignalMemoryAdapter";
import type { SignalMemoryAdapter, SignalMemoryProvider } from "./types";

type SignalMemoryProviderEnv = Pick<ImportMetaEnv, "VITE_SIGNAL_MEMORY_PROVIDER">;

export function getSignalMemoryProvider(env: SignalMemoryProviderEnv = import.meta.env): SignalMemoryProvider {
  return String(env.VITE_SIGNAL_MEMORY_PROVIDER || "none").toLowerCase() === "memwal" ? "memwal" : "none";
}

export function createSignalMemoryAdapter(
  env: SignalMemoryProviderEnv = import.meta.env,
): SignalMemoryAdapter {
  if (getSignalMemoryProvider(env) !== "memwal") {
    return noopSignalMemoryAdapter;
  }
  return new MemWalSignalMemoryAdapter();
}
