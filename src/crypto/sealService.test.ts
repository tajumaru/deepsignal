import { describe, expect, it, vi } from "vitest";
import type { SealAdapter } from "../types";
import { createRealSealEnvelope } from "./sealPayload";
import {
  decryptLegacyUnencryptedResponse,
  decryptSensitiveResponse,
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
