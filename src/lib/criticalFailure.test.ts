import { describe, expect, it } from "vitest";
import { createCriticalFailure } from "./criticalFailure";

describe("createCriticalFailure", () => {
  const occurredAt = new Date("2026-05-15T12:00:00.000Z");

  it("classifies wallet rejection failures and keeps the error id stable", () => {
    const failure = createCriticalFailure({
      error: new Error("Wallet approval rejected by user."),
      surface: "wallet",
      step: "publish",
      occurredAt,
    });
    const repeated = createCriticalFailure({
      error: new Error("Wallet approval rejected by user."),
      surface: "wallet",
      step: "publish",
      occurredAt,
    });

    expect(failure.kind).toBe("wallet_rejected");
    expect(failure.noDataSubmitted).toBe(true);
    expect(failure.id).toMatch(/^DS-20260515-WALLET-[0-9A-F]{4}$/);
    expect(failure.id).toBe(repeated.id);
  });

  it("classifies Walrus upload failures", () => {
    const failure = createCriticalFailure({
      error: new Error("Walrus upload failed: relay returned 503"),
      surface: "walrus",
      step: "uploading_to_walrus",
      occurredAt,
    });

    expect(failure.kind).toBe("walrus_upload_failed");
    expect(failure.retryable).toBe(true);
  });

  it("classifies Seal encryption failures", () => {
    const failure = createCriticalFailure({
      error: new Error("Encryption failed. Response was not submitted."),
      surface: "seal",
      step: "encrypting",
      occurredAt,
    });

    expect(failure.kind).toBe("seal_failed");
    expect(failure.noDataSubmitted).toBe(true);
  });

  it("marks registry failures after upload success as resumable partial completions", () => {
    const failure = createCriticalFailure({
      error: new Error("Sui registration completed with an error."),
      surface: "registry",
      step: "registry",
      uploadSucceeded: true,
      registryUpdated: false,
      occurredAt,
    });

    expect(failure.kind).toBe("registry_failed");
    expect(failure.uploadSucceeded).toBe(true);
    expect(failure.registryUpdated).toBe(false);
    expect(failure.noDataSubmitted).toBe(false);
  });
});
