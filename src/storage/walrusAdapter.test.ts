import { afterEach, describe, expect, it, vi } from "vitest";
import { readJsonBlobOrThrow } from "./walrusAdapter";

describe("walrusAdapter read timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects stalled blob reads instead of hanging forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    const readPromise = readJsonBlobOrThrow("blob-stalled");
    const expectation = expect(readPromise).rejects.toMatchObject({
      name: "WalrusBlobReadError",
      code: "blob_unavailable",
      blobId: "blob-stalled",
    });
    await vi.runAllTimersAsync();

    await expectation;
  }, 10000);
});
