export { getMemoryAdapter, isMemWalEnabled } from "./factory";
export { createSignalMemoryAdapter, getSignalMemoryProvider } from "./signalMemoryFactory";
export { validateMemWalConfig, type MemWalConfigValidation } from "./memwalConfig";
export { NoopMemoryAdapter, noopMemoryAdapter } from "./noopMemoryAdapter";
export { NoopSignalMemoryAdapter, noopSignalMemoryAdapter } from "./noopSignalMemoryAdapter";
export { UnsafeSignalMemoryError, assertSafeSignalPatternMemory } from "./signalMemorySafety";
export {
  createDraftFromDiagnosticsSummaryGroup,
  createDraftFromSelectedSignals,
} from "./patternMemoryDrafts";
export type {
  MemoryAdapter,
  MemoryAdapterKind,
  MemoryRecallResult,
  MemoryRuntimeStatus,
  MemoryWriteResult,
  ReviewMemoryMatch,
  ReviewMemoryRecallQuery,
  ReviewMemoryRecord,
  SignalMemoryAdapter,
  SignalMemoryAdapterKind,
  SignalMemoryProvider,
  SignalMemorySearchOptions,
  SignalMemorySearchResult,
  SignalMemoryWriteResult,
  SignalKind,
  SignalPatternMemory,
  SignalPatternMemoryConfidence,
  SignalPatternMemoryDraft,
  SignalPatternMemoryFrequency,
  SignalPatternMemoryFix,
  SignalPatternMemoryStatus,
  SignalPatternMemoryType,
} from "./types";
