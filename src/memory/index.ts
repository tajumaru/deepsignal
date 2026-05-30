export { getMemoryAdapter, isMemWalEnabled } from "./factory";
export { validateMemWalConfig, type MemWalConfigValidation } from "./memwalConfig";
export { NoopMemoryAdapter, noopMemoryAdapter } from "./noopMemoryAdapter";
export type {
  MemoryAdapter,
  MemoryAdapterKind,
  MemoryRecallResult,
  MemoryRuntimeStatus,
  MemoryWriteResult,
  ReviewMemoryMatch,
  ReviewMemoryRecallQuery,
  ReviewMemoryRecord,
} from "./types";
