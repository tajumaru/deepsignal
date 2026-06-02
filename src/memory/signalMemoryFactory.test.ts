import { describe, expect, it } from "vitest";
import type { SignalPatternMemory, SignalPatternMemoryDraft } from "./types";
import {
  createDraftFromDiagnosticsSummaryGroup,
  createSignalMemoryAdapter,
  getSignalMemoryProvider,
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
      VITE_SIGNAL_MEMORY_PROVIDER: "memwal",
    } as ImportMetaEnv).kind).toBe("memwal-placeholder");
  });

  it("rejects objects containing forbidden raw signal fields", async () => {
    const adapter = createSignalMemoryAdapter({} as ImportMetaEnv);
    const unsafeMemory = {
      ...safeMemory(),
      answers: {
        raw: "raw answer text",
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
        ok: true,
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
});
