import { describe, expect, it } from "vitest";
import { formatWalrusFailureStage, isWalletApprovalError } from "./walrusDiagnostics";

describe("walrusDiagnostics", () => {
  it("classifies incorrect password errors as wallet approval failures", () => {
    expect(isWalletApprovalError(new Error("Incorrect password"))).toBe(true);
  });

  it("formats wallet approval failures for diagnostics UI", () => {
    expect(formatWalrusFailureStage("wallet-approval")).toBe("Wallet approval failed");
  });
});
