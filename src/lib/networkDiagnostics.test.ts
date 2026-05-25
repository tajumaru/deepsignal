import { describe, expect, it } from "vitest";
import {
  buildNetworkDiagnosticsCopy,
  describeNetworkError,
  formatNetworkDiagnosticDetail,
  getOverallNetworkChipClass,
  getOverallNetworkLabel,
  getOverallNetworkState,
} from "./networkDiagnostics";

describe("networkDiagnostics", () => {
  it("formats endpoint detail lines with latency and status", () => {
    expect(
      formatNetworkDiagnosticDetail({
        key: "rpc",
        label: "Sui RPC",
        state: "offline",
        latencyMs: 1200,
        statusCode: 504,
        error: "TimeoutError: request timed out",
      }),
    ).toBe("1200 ms · HTTP 504 · TimeoutError: request timed out");
  });

  it("treats mixed endpoint health as degraded instead of unavailable", () => {
    const entries = [
      { key: "rpc", label: "Sui RPC", state: "online" as const },
      { key: "aggregator", label: "Walrus aggregator", state: "offline" as const },
      { key: "publisher", label: "Walrus publisher", state: "online" as const },
    ];
    expect(getOverallNetworkState(entries)).toBe("degraded");
    expect(getOverallNetworkLabel(entries)).toBe("Degraded");
    expect(getOverallNetworkChipClass("degraded")).toBe("signal-chip-soft");
  });

  it("serializes diagnostics payloads for copy", () => {
    const text = buildNetworkDiagnosticsCopy({ wallet: { status: "disconnected" } });
    expect(text).toContain("\"status\": \"disconnected\"");
  });

  it("normalizes unknown error values", () => {
    expect(describeNetworkError(new Error("fetch failed"))).toContain("fetch failed");
    expect(describeNetworkError("cors blocked")).toBe("cors blocked");
  });
});
