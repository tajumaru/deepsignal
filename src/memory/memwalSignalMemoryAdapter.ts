import type {
  SignalMemoryAdapter,
  SignalMemorySearchOptions,
  SignalMemorySearchResult,
  SignalMemoryWriteResult,
  SignalPatternMemory,
} from "./types";
import {
  assertSafeSignalPatternMemory,
  assertSignalMemoryNamespace,
} from "./signalMemorySafety";

const skippedSearchResult: SignalMemorySearchResult = {
  memories: [],
  total: 0,
  skipped: true,
  reason: "memwal_not_implemented",
};

export class MemWalSignalMemoryAdapter implements SignalMemoryAdapter {
  readonly kind = "memwal-placeholder";

  async listMemories(namespace: string) {
    assertSignalMemoryNamespace(namespace);
    return [];
  }

  async getMemory(namespace: string, memoryId: string) {
    assertSignalMemoryNamespace(namespace);
    void memoryId;
    return null;
  }

  async saveMemory(namespace: string, memory: SignalPatternMemory): Promise<SignalMemoryWriteResult> {
    assertSignalMemoryNamespace(namespace);
    assertSafeSignalPatternMemory(memory);
    return {
      ok: false,
      skipped: true,
      reason: "memwal_not_implemented",
      memoryId: memory.memoryId,
    };
  }

  async searchMemories(
    namespace: string,
    query: string,
    options: SignalMemorySearchOptions = {},
  ): Promise<SignalMemorySearchResult> {
    assertSignalMemoryNamespace(namespace);
    void query;
    void options;
    return skippedSearchResult;
  }
}
