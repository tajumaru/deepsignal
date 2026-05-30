import type {
  MemoryAdapter,
  MemoryRecallResult,
  MemoryRuntimeStatus,
  MemoryWriteResult,
} from "./types";

const disabledStatus: MemoryRuntimeStatus = {
  mode: "disabled",
  enabled: false,
  notice: "MemWal memory is disabled. Review saves and recall continue without memory sync.",
  configured: false,
};

const skippedWrite: MemoryWriteResult = {
  status: "skipped",
  reason: "disabled",
};

const skippedRecall: MemoryRecallResult = {
  status: "skipped",
  reason: "disabled",
  matches: [],
};

export const noopMemoryAdapter: MemoryAdapter = {
  getRuntimeStatus() {
    return disabledStatus;
  },
  async rememberReviewMemory() {
    return skippedWrite;
  },
  async recallReviewMemory() {
    return skippedRecall;
  },
};
