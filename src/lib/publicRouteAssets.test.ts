import { afterEach, describe, expect, it, vi } from "vitest";
import { probePublicAsset } from "./publicRouteAssets";

describe("public route asset verification", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries transient Walrus 503 responses before failing a public module asset", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("propagating", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }))
      .mockResolvedValueOnce(new Response("export {}", {
        status: 200,
        headers: { "content-type": "text/javascript" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const probePromise = probePublicAsset("./assets/mysten-sui-test.js", "https://deepsignal.wal.app");
    await vi.advanceTimersByTimeAsync(900);
    const probe = await probePromise;

    expect(probe.ok).toBe(true);
    expect(probe.status).toBe(200);
    expect(probe.attempts).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("records fetch failures as diagnostic attempts", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const probePromise = probePublicAsset("./assets/PublicFormPage-test.js", "https://deepsignal.wal.app");
    await vi.runAllTimersAsync();
    const probe = await probePromise;

    expect(probe.ok).toBe(false);
    expect(probe.status).toBe(0);
    expect(probe.attempts).toHaveLength(8);
    expect(probe.errorMessage).toContain("fetch failed");
  });
});
