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

const memoriesByNamespace = new Map<string, Map<string, SignalPatternMemory>>();

function getNamespaceStore(namespace: string) {
  const existing = memoriesByNamespace.get(namespace);
  if (existing) {
    return existing;
  }
  const store = new Map<string, SignalPatternMemory>();
  memoriesByNamespace.set(namespace, store);
  return store;
}

function memoryMatchesQuery(memory: SignalPatternMemory, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const haystack = [
    memory.title,
    memory.summary,
    ...memory.tags,
    memory.type,
    memory.status,
  ].join(" ").toLowerCase();
  return haystack.includes(normalizedQuery);
}

function memoryMatchesOptions(memory: SignalPatternMemory, options: SignalMemorySearchOptions) {
  if (options.type && memory.type !== options.type) {
    return false;
  }
  if (options.status && memory.status !== options.status) {
    return false;
  }
  if (options.tags?.length && !options.tags.every((tag) => memory.tags.includes(tag))) {
    return false;
  }
  return true;
}

export class InMemorySignalMemoryAdapter implements SignalMemoryAdapter {
  readonly kind = "memory";

  async listMemories(namespace: string) {
    assertSignalMemoryNamespace(namespace);
    return [...getNamespaceStore(namespace).values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getMemory(namespace: string, memoryId: string) {
    assertSignalMemoryNamespace(namespace);
    return getNamespaceStore(namespace).get(memoryId) ?? null;
  }

  async saveMemory(namespace: string, memory: SignalPatternMemory): Promise<SignalMemoryWriteResult> {
    assertSignalMemoryNamespace(namespace);
    assertSafeSignalPatternMemory(memory);
    getNamespaceStore(namespace).set(memory.memoryId, memory);
    return {
      ok: true,
      skipped: false,
      memoryId: memory.memoryId,
    };
  }

  async searchMemories(
    namespace: string,
    query: string,
    options: SignalMemorySearchOptions = {},
  ): Promise<SignalMemorySearchResult> {
    assertSignalMemoryNamespace(namespace);
    const matches = [...getNamespaceStore(namespace).values()]
      .filter((memory) => memoryMatchesQuery(memory, query))
      .filter((memory) => memoryMatchesOptions(memory, options))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const limited = typeof options.limit === "number" ? matches.slice(0, options.limit) : matches;
    return {
      memories: limited,
      total: matches.length,
      skipped: false,
    };
  }
}

export const inMemorySignalMemoryAdapter = new InMemorySignalMemoryAdapter();

export function clearInMemorySignalMemoriesForTests() {
  memoriesByNamespace.clear();
}
