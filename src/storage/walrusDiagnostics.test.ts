import { describe, expect, it } from "vitest";
import { formatWalrusFailureStage, getWalrusRecoveryHint, isWalletApprovalError } from "./walrusDiagnostics";
import { storage } from "./storageFactory";
import { localStorageAdapter } from "./localStorageAdapter";
import { walrusAdapter } from "./walrusAdapter";
import { getStorageRuntimeStatus } from "./storageRuntime";
import type { FormSchema } from "../types";
import { vi } from "vitest";

vi.mock("./localStorageAdapter", () => ({
  localStorageAdapter: {
    saveForm: vi.fn(async (form: FormSchema) => ({ id: form.id })),
  },
}));

vi.mock("./walrusAdapter", () => ({
  walrusAdapter: {
    saveForm: vi.fn(),
  },
}));

describe("walrusDiagnostics", () => {
  it("classifies incorrect password errors as wallet approval failures", () => {
    expect(isWalletApprovalError(new Error("Incorrect password"))).toBe(true);
  });

  it("formats wallet approval failures for diagnostics UI", () => {
    expect(formatWalrusFailureStage("wallet-approval")).toBe("Wallet approval failed");
  });

  it("derives a recovery hint for wallet connection failures", () => {
    expect(getWalrusRecoveryHint(new Error("Could not establish connection. Receiving end does not exist.")))
      .toContain("Reconnect or restart the wallet extension");
  });

  it("does not fall back to local storage on wallet password failure", async () => {
    vi.mocked(walrusAdapter.saveForm).mockRejectedValueOnce(new Error("Incorrect password"));

    await expect(storage.saveForm({
      id: "form-1",
      title: "Test",
      description: "",
      fields: [],
      createdAt: "2026-06-11T00:00:00.000Z",
    } as FormSchema)).rejects.toThrow("Incorrect password");

    expect(localStorageAdapter.saveForm).not.toHaveBeenCalled();
    expect(getStorageRuntimeStatus().mode).toBe("walrus");
    expect(getStorageRuntimeStatus().notice).toBe("Incorrect password");
  });
});
