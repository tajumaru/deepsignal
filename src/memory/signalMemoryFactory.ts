import { inMemorySignalMemoryAdapter } from "./inMemorySignalMemoryAdapter";
import { MemWalSignalMemoryAdapter } from "./memwalSignalMemoryAdapter";
import { noopSignalMemoryAdapter } from "./noopSignalMemoryAdapter";
import type { SignalMemoryAdapter, SignalMemoryProvider } from "./types";

type SignalMemoryProviderEnv = Pick<ImportMetaEnv, "VITE_SIGNAL_MEMORY_PROVIDER">;

export function getSignalMemoryProvider(env: SignalMemoryProviderEnv = import.meta.env): SignalMemoryProvider {
  const provider = String(env.VITE_SIGNAL_MEMORY_PROVIDER || "none").toLowerCase();
  if (provider === "memory" || provider === "memwal") {
    return provider;
  }
  return "none";
}

export function createSignalMemoryAdapter(
  env: SignalMemoryProviderEnv = import.meta.env,
): SignalMemoryAdapter {
  const provider = getSignalMemoryProvider(env);
  if (provider === "memory") {
    return inMemorySignalMemoryAdapter;
  }
  if (provider === "memwal") {
    return new MemWalSignalMemoryAdapter();
  }
  return noopSignalMemoryAdapter;
}
