import { describe, expect, it, vi } from "vitest";
import type { SealAdapter } from "../types";
import { createRealSealEnvelope } from "./sealPayload";
import {
  decryptLegacyUnencryptedResponse,
  decryptSensitiveResponse,
  encryptSensitiveResponse,
} from "./sealService";

const fakeSealAdapter: SealAdapter = {
  encrypt: vi.fn(async (value) => value),
  decrypt: vi.fn(async () => "decrypted plaintext"),
};

function makeSealEnvelope() {
  return JSON.stringify(
    createRealSealEnvelope({
      network: "testnet",
      packageId: "0xpackage",
      objectId: "0xobject",
      threshold: 1,
      serverObjectIds: ["0xserver"],
      encryptedObject: "ciphertext",
      policyId: "project_signal_v1",
      policyObjectId: "project-1",
      approvalPolicy: "project_signal_v1",
      projectId: "project-1",
    }),
  );
}

describe("decryptSensitiveResponse fail-closed behavior", () => {
  it("rejects plaintext by default instead of treating it as legacy", async () => {
    await expect(
      decryptSensitiveResponse("plain response", {}, fakeSealAdapter),
    ).rejects.toMatchObject({
      reasonCode: "MANIFEST_MISMATCH",
    });
  });

  it("rejects non-Seal payloads marked encrypted even when legacy fallback is allowed", async () => {
    await expect(
      decryptSensitiveResponse("plain response", {}, fakeSealAdapter, {
        allowLegacyUnencrypted: true,
        encryptedMarker: true,
      }),
    ).rejects.toMatchObject({
      reasonCode: "MANIFEST_MISMATCH",
    });
  });

  it("only allows plaintext through the explicit legacy migration helper", async () => {
    await expect(
      decryptLegacyUnencryptedResponse("legacy response", {}, fakeSealAdapter),
    ).resolves.toEqual({
      plaintext: "legacy response",
      legacyUnencrypted: true,
    });
  });

  it("decrypts valid Seal envelopes", async () => {
    await expect(
      decryptSensitiveResponse(makeSealEnvelope(), {}, fakeSealAdapter, {
        encryptedMarker: true,
      }),
    ).resolves.toEqual({
      plaintext: "decrypted plaintext",
      legacyUnencrypted: false,
    });
  });
});

describe("encryptSensitiveResponse retry behavior", () => {
  it("retries transient Seal fetch aborts before failing closed", async () => {
    vi.useFakeTimers();
    const envelope = makeSealEnvelope();
    const sealAdapter: SealAdapter = {
      encrypt: vi
        .fn()
        .mockRejectedValueOnce(new Error("Fetch is aborted"))
        .mockResolvedValueOnce(envelope),
      decrypt: vi.fn(async () => "decrypted"),
    };

    try {
      const promise = encryptSensitiveResponse("private signal", { projectId: "project-1" }, sealAdapter);
      await vi.advanceTimersByTimeAsync(300);

      await expect(promise).resolves.toBe(envelope);
      expect(sealAdapter.encrypt).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still fails closed after repeated transient Seal fetch aborts", async () => {
    vi.useFakeTimers();
    const sealAdapter: SealAdapter = {
      encrypt: vi.fn(async () => {
        throw new Error("Fetch is aborted");
      }),
      decrypt: vi.fn(async () => "decrypted"),
    };

    try {
      const promise = encryptSensitiveResponse("private signal", { projectId: "project-1" }, sealAdapter);
      const expectation = expect(promise).rejects.toMatchObject({
        code: "ENCRYPTION_FAILED",
        diagnosticMessage: "Fetch is aborted",
      });
      await vi.advanceTimersByTimeAsync(300);
      await vi.advanceTimersByTimeAsync(900);

      await expectation;
      expect(sealAdapter.encrypt).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
