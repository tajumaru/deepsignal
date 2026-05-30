import type {
  MemoryAdapter,
  MemoryRecallResult,
  MemoryRuntimeStatus,
  MemoryWriteResult,
  ReviewMemoryRecallQuery,
  ReviewMemoryRecord,
} from "./types";

const noopRuntimeStatus: MemoryRuntimeStatus = {
  kind: "noop",
  enabled: false,
  configured: false,
  reason: "disabled",
};

const skippedWrite: MemoryWriteResult = {
  ok: false,
  skipped: true,
  reason: "disabled",
};

const skippedRecall: MemoryRecallResult = {
  ok: false,
  skipped: true,
  reason: "disabled",
  matches: [],
};

export class NoopMemoryAdapter implements MemoryAdapter {
  readonly kind = "noop";

  getRuntimeStatus() {
    return noopRuntimeStatus;
  }

  async rememberReviewMemory(record: ReviewMemoryRecord) {
    void record;
    return skippedWrite;
  }

  async recallReviewMemory(query: ReviewMemoryRecallQuery) {
    void query;
    return skippedRecall;
  }
}

export const noopMemoryAdapter = new NoopMemoryAdapter();
