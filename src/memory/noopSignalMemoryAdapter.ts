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

const noopSearchResult: SignalMemorySearchResult = {
  memories: [],
  total: 0,
  skipped: true,
  reason: "noop",
};

export class NoopSignalMemoryAdapter implements SignalMemoryAdapter {
  readonly kind = "noop";

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
      ok: true,
      skipped: true,
      reason: "noop",
      memoryId: memory.memoryId,
    };
  }

  async searchMemories(
    namespace: string,
    query: string,
    options: SignalMemorySearchOptions = {},
  ) {
    assertSignalMemoryNamespace(namespace);
    void query;
    void options;
    return noopSearchResult;
  }
}

export const noopSignalMemoryAdapter = new NoopSignalMemoryAdapter();
