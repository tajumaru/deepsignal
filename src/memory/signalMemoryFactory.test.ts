import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalPatternMemory, SignalPatternMemoryDraft } from "./types";
import {
  createDraftFromDiagnosticsSummaryGroup,
  createSignalMemoryAdapter,
  clearInMemorySignalMemoriesForTests,
  getSignalMemoryProvider,
  setSignalMemoryMemWalClientFactoryForTests,
  UnsafeSignalMemoryError,
} from "./index";

function memoryFromDraft(draft: SignalPatternMemoryDraft): SignalPatternMemory {
  return {
    ...draft,
    memoryId: "memory-1",
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

function safeMemory() {
  return memoryFromDraft(createDraftFromDiagnosticsSummaryGroup({
    key: "fp-safe",
    count: 2,
    severityMax: "error",
    firstSeen: "2026-06-02T00:00:00.000Z",
    lastSeen: "2026-06-03T00:00:00.000Z",
    examples: ["system-1", "system-2"],
  }));
}

describe("Signal Pattern Memory adapter factory", () => {
  beforeEach(() => {
    clearInMemorySignalMemoriesForTests();
    setSignalMemoryMemWalClientFactoryForTests(null);
  });

  it("uses the noop provider by default", () => {
    expect(getSignalMemoryProvider({} as ImportMetaEnv)).toBe("none");
    expect(createSignalMemoryAdapter({} as ImportMetaEnv).kind).toBe("noop");
  });

  it("does not use the MemWal provider unless VITE_SIGNAL_MEMORY_PROVIDER is explicitly memwal", () => {
    expect(createSignalMemoryAdapter({
      VITE_MEMWAL_ENABLED: "true",
    } as ImportMetaEnv).kind).toBe("noop");

    expect(createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "none",
    } as ImportMetaEnv).kind).toBe("noop");

    expect(createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memory",
    } as ImportMetaEnv).kind).toBe("memory");

    expect(createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memwal",
    } as ImportMetaEnv).kind).toBe("memwal");
  });

  it("does not write with the MemWal provider when config is invalid", async () => {
    const remember = vi.fn();
    setSignalMemoryMemWalClientFactoryForTests(async () => ({
      remember,
      recall: vi.fn(),
    }));
    const adapter = createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memwal",
      VITE_MEMWAL_ENABLED: "true",
      VITE_MEMWAL_SERVER_URL: "https://relayer.staging.memwal.ai",
    } as ImportMetaEnv);
    const memory = safeMemory();

    await expect(adapter.saveMemory("deepsignal:project:1:signal-pattern-memory:v1", memory))
      .resolves
      .toEqual({
        ok: false,
        skipped: true,
        reason: "memwal_not_configured",
        memoryId: memory.memoryId,
      });
    expect(remember).not.toHaveBeenCalled();
    await expect(adapter.listMemories("deepsignal:project:1:signal-pattern-memory:v1")).resolves.toEqual([]);
  });

  it("rejects forbidden raw fields before writing to MemWal", async () => {
    const remember = vi.fn();
    setSignalMemoryMemWalClientFactoryForTests(async () => ({
      remember,
      recall: vi.fn(),
    }));
    const adapter = createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memwal",
      VITE_MEMWAL_ENABLED: "true",
      VITE_MEMWAL_SERVER_URL: "https://relayer.staging.memwal.ai",
      VITE_MEMWAL_ACCOUNT_ID: "0xmemwalaccount",
      VITE_MEMWAL_DELEGATE_KEY: `0x${"a".repeat(64)}`,
    } as ImportMetaEnv);
    const unsafeMemory = {
      ...safeMemory(),
      answers: { raw: "raw signal data" },
    } as never;

    await expect(adapter.saveMemory("deepsignal:project:1:signal-pattern-memory:v1", unsafeMemory))
      .rejects
      .toBeInstanceOf(UnsafeSignalMemoryError);
    expect(remember).not.toHaveBeenCalled();
  });


  it.each([
    "answers",
    "publicPayload",
    "encryptedPayload",
    "attachments",
    "metadata",
    "respondentMeta",
    "responderSignature",
    "responderSignedBytes",
    "errorStack",
  ])("rejects objects containing forbidden raw signal field %s", async (field) => {
    const adapter = createSignalMemoryAdapter({} as ImportMetaEnv);
    const unsafeMemory = {
      ...safeMemory(),
      [field]: {
        raw: "raw signal data",
      },
    } as SignalPatternMemory;

    await expect(adapter.saveMemory("deepsignal:project:1:signal-pattern-memory:v1", unsafeMemory))
      .rejects
      .toBeInstanceOf(UnsafeSignalMemoryError);
  });

  it("saves a draft-converted memory through the noop adapter without remote persistence", async () => {
    const adapter = createSignalMemoryAdapter({} as ImportMetaEnv);
    const memory = safeMemory();

    await expect(adapter.saveMemory("deepsignal:project:1:signal-pattern-memory:v1", memory))
      .resolves
      .toEqual({
        ok: false,
        skipped: true,
        reason: "noop",
        memoryId: "memory-1",
      });
    await expect(adapter.listMemories("deepsignal:project:1:signal-pattern-memory:v1")).resolves.toEqual([]);
    await expect(adapter.getMemory("deepsignal:project:1:signal-pattern-memory:v1", "memory-1")).resolves.toBeNull();
    await expect(adapter.searchMemories("deepsignal:project:1:signal-pattern-memory:v1", "fp-safe"))
      .resolves
      .toEqual({
        memories: [],
        total: 0,
        skipped: true,
        reason: "noop",
      });
  });

  it("persists memories for the current runtime when the memory provider is enabled", async () => {
    const adapter = createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memory",
    } as ImportMetaEnv);
    const namespace = "deepsignal:project:1:signal-pattern-memory:v1";
    const memory = {
      ...safeMemory(),
      title: "Runtime Safari memory",
      tags: ["safari", "runtime"],
    };

    await expect(adapter.saveMemory(namespace, memory))
      .resolves
      .toEqual({
        ok: true,
        skipped: false,
        memoryId: "memory-1",
      });
    await expect(adapter.listMemories(namespace)).resolves.toEqual([memory]);
    await expect(adapter.getMemory(namespace, "memory-1")).resolves.toEqual(memory);
    await expect(adapter.searchMemories(namespace, "safari", { tags: ["runtime"] }))
      .resolves
      .toEqual({
        memories: [memory],
        total: 1,
        skipped: false,
      });
    await expect(adapter.searchMemories(namespace, "safari", { type: "user_feedback_pattern" }))
      .resolves
      .toMatchObject({
        memories: [],
        total: 0,
        skipped: false,
      });
  });

  it("keeps runtime memories isolated by namespace", async () => {
    const adapter = createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memory",
    } as ImportMetaEnv);
    const firstNamespace = "deepsignal:project:1:signal-pattern-memory:v1";
    const secondNamespace = "deepsignal:project:2:signal-pattern-memory:v1";
    const memory = safeMemory();

    await adapter.saveMemory(firstNamespace, memory);

    await expect(adapter.listMemories(firstNamespace)).resolves.toEqual([memory]);
    await expect(adapter.listMemories(secondNamespace)).resolves.toEqual([]);
    await expect(adapter.getMemory(secondNamespace, memory.memoryId)).resolves.toBeNull();
    await expect(adapter.searchMemories(secondNamespace, memory.title)).resolves.toMatchObject({
      memories: [],
      total: 0,
      skipped: false,
    });
  });

  it("updates runtime memories and refreshes updatedAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00.000Z"));
    const adapter = createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memory",
    } as ImportMetaEnv);
    const namespace = "deepsignal:project:1:signal-pattern-memory:v1";
    const memory = safeMemory();

    await adapter.saveMemory(namespace, memory);
    await expect(adapter.updateMemory(namespace, memory.memoryId, {
      status: "investigating",
      confidence: "high",
      recommendedAction: "Review the confirmed runtime cluster.",
      recommendedCodexPrompt: "Investigate the confirmed runtime cluster.",
      failedFixes: [{ summary: "Cache-only recovery did not fix the issue." }],
      confirmedFixes: [{ summary: "Route preloading fixed the issue." }],
    })).resolves.toEqual({
      ok: true,
      skipped: false,
      memoryId: memory.memoryId,
    });

    const updated = await adapter.getMemory(namespace, memory.memoryId);
    expect(updated).toMatchObject({
      status: "investigating",
      confidence: "high",
      recommendedAction: "Review the confirmed runtime cluster.",
      recommendedCodexPrompt: "Investigate the confirmed runtime cluster.",
      failedFixes: [{ summary: "Cache-only recovery did not fix the issue." }],
      confirmedFixes: [{ summary: "Route preloading fixed the issue." }],
      updatedAt: "2026-06-04T12:00:00.000Z",
    });
    expect(updated?.createdAt).toBe(memory.createdAt);
    vi.useRealTimers();
  });

  it("rejects forbidden raw fields in update patches", async () => {
    const adapter = createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memory",
    } as ImportMetaEnv);
    const namespace = "deepsignal:project:1:signal-pattern-memory:v1";
    const memory = safeMemory();

    await adapter.saveMemory(namespace, memory);
    await expect(adapter.updateMemory(namespace, memory.memoryId, {
      recommendedAction: "Unsafe update",
      metadata: { raw: "secret" },
    } as never)).rejects.toBeInstanceOf(UnsafeSignalMemoryError);
  });

  it("saves, lists, gets, and searches through a mocked MemWal client", async () => {
    const storedTexts: string[] = [];
    const remember = vi.fn(async (text: string) => {
      storedTexts.push(text);
    });
    const recall = vi.fn(async ({ query }: { query: string }) => ({
      results: storedTexts
        .filter((text) => text.toLowerCase().includes(query.toLowerCase()) || query.includes("deepsignal signal pattern memory"))
        .map((text) => ({ text })),
      total: storedTexts.length,
    }));
    setSignalMemoryMemWalClientFactoryForTests(async () => ({
      remember,
      recall,
    }));
    const adapter = createSignalMemoryAdapter({
      VITE_SIGNAL_MEMORY_PROVIDER: "memwal",
      VITE_MEMWAL_ENABLED: "true",
      VITE_MEMWAL_SERVER_URL: "https://relayer.staging.memwal.ai",
      VITE_MEMWAL_ACCOUNT_ID: "0xmemwalaccount",
      VITE_MEMWAL_DELEGATE_KEY: `0x${"a".repeat(64)}`,
    } as ImportMetaEnv);
    const namespace = "deepsignal:project:1:signal-pattern-memory:v1";
    const memory = {
      ...safeMemory(),
      title: "MemWal Safari memory",
      tags: ["safari", "runtime"],
      recommendedAction: "Review the safe MemWal memory.",
    };

    await expect(adapter.saveMemory(namespace, memory)).resolves.toEqual({
      ok: true,
      skipped: false,
      memoryId: memory.memoryId,
    });
    expect(remember).toHaveBeenCalledTimes(1);
    expect(remember).toHaveBeenCalledWith(expect.stringContaining("MemWal Safari memory"), namespace);
    expect(storedTexts[0]).not.toContain("answers");
    expect(storedTexts[0]).not.toContain("encryptedPayload");
    expect(storedTexts[0]).not.toContain("attachments");
    expect(storedTexts[0]).not.toContain("metadata");

    await expect(adapter.listMemories(namespace)).resolves.toEqual([memory]);
    await expect(adapter.getMemory(namespace, memory.memoryId)).resolves.toEqual(memory);
    await expect(adapter.searchMemories(namespace, "safari", { tags: ["runtime"] })).resolves.toEqual({
      memories: [memory],
      total: 1,
      skipped: false,
    });
    expect(recall).toHaveBeenCalledWith(expect.objectContaining({ namespace }));
  });
});
