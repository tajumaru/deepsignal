import { validateMemWalConfig, type MemWalConfigValidation } from "./memwalConfig";
import {
  assertSafeSignalPatternMemory,
  assertSignalMemoryNamespace,
} from "./signalMemorySafety";
import type {
  SignalMemoryAdapter,
  SignalMemorySearchOptions,
  SignalMemorySearchResult,
  SignalMemoryWriteResult,
  SignalPatternMemory,
  SignalPatternMemoryPatch,
} from "./types";

type MemWalConfigEnv = Parameters<typeof validateMemWalConfig>[0];

type MemWalRecallResult = {
  results?: Array<{
    text?: string;
  }>;
  total?: number;
};

export type SignalMemoryMemWalClient = {
  remember(text: string, namespace?: string): Promise<unknown>;
  recall(params: { query: string; limit?: number; namespace?: string }): Promise<MemWalRecallResult>;
};

type SignalMemoryMemWalClientFactory = (
  config: MemWalConfigValidation,
  namespace: string,
) => Promise<SignalMemoryMemWalClient>;

const MEMORY_ENVELOPE_KIND = "deepsignal.signal_pattern_memory";
const MEMORY_ENVELOPE_VERSION = 1;
const LIST_MEMORIES_QUERY = "deepsignal signal pattern memory reviewed redacted advisory";

let testClientFactory: SignalMemoryMemWalClientFactory | null = null;

export function setSignalMemoryMemWalClientFactoryForTests(factory: SignalMemoryMemWalClientFactory | null) {
  testClientFactory = factory;
}

async function createDefaultMemWalClient(
  config: MemWalConfigValidation,
  namespace: string,
): Promise<SignalMemoryMemWalClient> {
  if (!config.serverUrl || !config.accountId || !config.delegateKey) {
    throw new Error("MemWal is not configured.");
  }
  const { MemWal } = await import("@mysten-incubation/memwal");
  return MemWal.create({
    key: config.delegateKey,
    accountId: config.accountId,
    serverUrl: config.serverUrl,
    namespace,
  });
}

function createSkippedSearchResult(reason: "memwal_not_configured"): SignalMemorySearchResult {
  return {
    memories: [],
    total: 0,
    skipped: true,
    reason,
  };
}

function serializeMemory(memory: SignalPatternMemory) {
  return JSON.stringify({
    kind: MEMORY_ENVELOPE_KIND,
    version: MEMORY_ENVELOPE_VERSION,
    advisory: true,
    canonicalSource: "DeepSignal storage/diagnostics/review state",
    memory,
  });
}

function parseMemoryEnvelope(text: string | undefined): SignalPatternMemory | null {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as { kind?: string; version?: number; memory?: unknown };
    if (parsed.kind !== MEMORY_ENVELOPE_KIND || parsed.version !== MEMORY_ENVELOPE_VERSION) {
      return null;
    }
    assertSafeSignalPatternMemory(parsed.memory);
    return parsed.memory as SignalPatternMemory;
  } catch {
    return null;
  }
}

function isSignalPatternMemory(value: SignalPatternMemory | null): value is SignalPatternMemory {
  return value !== null;
}

function memoryMatchesQuery(memory: SignalPatternMemory, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [
    memory.memoryId,
    memory.title,
    memory.summary,
    memory.type,
    memory.status,
    memory.tags.join(" "),
    memory.evidenceSummary.join(" "),
    memory.recommendedAction,
    memory.recommendedCodexPrompt,
  ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
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

function dedupeLatest(memories: SignalPatternMemory[]) {
  const byId = new Map<string, SignalPatternMemory>();
  for (const memory of memories) {
    const previous = byId.get(memory.memoryId);
    if (!previous || memory.updatedAt.localeCompare(previous.updatedAt) > 0) {
      byId.set(memory.memoryId, memory);
    }
  }
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export class MemWalSignalMemoryAdapter implements SignalMemoryAdapter {
  readonly kind = "memwal";

  private readonly config: MemWalConfigValidation;

  constructor(env: MemWalConfigEnv = import.meta.env) {
    this.config = validateMemWalConfig(env);
  }

  private isConfigured() {
    return this.config.enabled && this.config.configured;
  }

  private async getClient(namespace: string) {
    const factory = testClientFactory ?? createDefaultMemWalClient;
    return factory(this.config, namespace);
  }

  async listMemories(namespace: string) {
    assertSignalMemoryNamespace(namespace);
    if (!this.isConfigured()) {
      return [];
    }
    const client = await this.getClient(namespace);
    const recalled = await client.recall({
      query: LIST_MEMORIES_QUERY,
      limit: 100,
      namespace,
    });
    return dedupeLatest((recalled.results ?? []).map((result) => parseMemoryEnvelope(result.text)).filter(isSignalPatternMemory));
  }

  async getMemory(namespace: string, memoryId: string) {
    assertSignalMemoryNamespace(namespace);
    if (!this.isConfigured()) {
      return null;
    }
    const client = await this.getClient(namespace);
    const recalled = await client.recall({
      query: memoryId,
      limit: 20,
      namespace,
    });
    return dedupeLatest((recalled.results ?? []).map((result) => parseMemoryEnvelope(result.text)).filter(isSignalPatternMemory))
      .find((memory) => memory.memoryId === memoryId) ?? null;
  }

  async saveMemory(namespace: string, memory: SignalPatternMemory): Promise<SignalMemoryWriteResult> {
    assertSignalMemoryNamespace(namespace);
    assertSafeSignalPatternMemory(memory);
    if (!this.isConfigured()) {
      return {
        ok: false,
        skipped: true,
        reason: "memwal_not_configured",
        memoryId: memory.memoryId,
      };
    }
    const client = await this.getClient(namespace);
    await client.remember(serializeMemory(memory), namespace);
    return {
      ok: true,
      skipped: false,
      memoryId: memory.memoryId,
    };
  }

  async updateMemory(
    namespace: string,
    memoryId: string,
    patch: SignalPatternMemoryPatch,
  ): Promise<SignalMemoryWriteResult> {
    assertSignalMemoryNamespace(namespace);
    assertSafeSignalPatternMemory(patch);
    const existing = await this.getMemory(namespace, memoryId);
    if (!existing) {
      return {
        ok: false,
        skipped: true,
        reason: this.isConfigured() ? undefined : "memwal_not_configured",
        memoryId,
      };
    }
    return this.saveMemory(namespace, {
      ...existing,
      ...patch,
      memoryId: existing.memoryId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
  }

  async searchMemories(
    namespace: string,
    query: string,
    options: SignalMemorySearchOptions = {},
  ): Promise<SignalMemorySearchResult> {
    assertSignalMemoryNamespace(namespace);
    if (!this.isConfigured()) {
      return createSkippedSearchResult("memwal_not_configured");
    }
    const client = await this.getClient(namespace);
    const limit = options.limit ?? 50;
    const recalled = await client.recall({
      query: query.trim() || LIST_MEMORIES_QUERY,
      limit,
      namespace,
    });
    const memories = dedupeLatest((recalled.results ?? []).map((result) => parseMemoryEnvelope(result.text)).filter(isSignalPatternMemory))
      .filter((memory) => memoryMatchesQuery(memory, query))
      .filter((memory) => memoryMatchesOptions(memory, options))
      .slice(0, limit);
    return {
      memories,
      total: memories.length,
      skipped: false,
    };
  }
}
