import { describe, expect, it, vi } from "vitest";
import {
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
} from "../crypto/sealPayload";
import { createRealSealEnvelope } from "../crypto/sealPayload";
import type { FormSchema, SealAdapter, Submission } from "../types";
import { decryptSensitiveAnswers, resolveSubmissionAnswers } from "./storage";

const fakeSealAdapter: SealAdapter = {
  encrypt: vi.fn(async (value) => value),
  decrypt: vi.fn(async () => "decrypted"),
};

const form: FormSchema = {
  id: "form-1",
  title: "Form",
  description: "",
  createdAt: new Date(0).toISOString(),
  projectId: "project-1",
  ownerAddress: "0xowner",
  manifestBlobId: "manifest-1",
  fields: [
    {
      id: "sensitive-field",
      type: "shortText",
      label: "Sensitive field",
      required: false,
      sensitive: true,
    },
  ],
};

function createEncryptedSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    formId: form.id,
    answers: {},
    attachments: [],
    category: "general",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: true,
    encryptedPayload: JSON.stringify(
      createRealSealEnvelope({
        network: "mainnet",
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
    ),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("decryptSensitiveAnswers", () => {
  it("fails closed when a sensitive field is marked encrypted but is not a Seal envelope", async () => {
    await expect(
      decryptSensitiveAnswers(
        form,
        {
          "sensitive-field": {
            encrypted: true,
            value: "plaintext payload",
          },
        },
        fakeSealAdapter,
      ),
    ).rejects.toMatchObject({
      reasonCode: "MANIFEST_MISMATCH",
    });
  });

  it("fails closed when a sensitive field is marked encrypted without a payload", async () => {
    await expect(
      decryptSensitiveAnswers(
        form,
        {
          "sensitive-field": {
            encrypted: true,
          },
        },
        fakeSealAdapter,
      ),
    ).rejects.toMatchObject({
      reasonCode: "MANIFEST_MISMATCH",
    });
  });
});

describe("resolveSubmissionAnswers decrypt classification", () => {
  it("returns WALLET_NOT_CONNECTED when no wallet is connected", async () => {
    const walletAwareAdapter: SealAdapter = {
      encrypt: vi.fn(async (value) => value),
      decrypt: vi.fn(async (_value, context) => {
        if (!context?.walletAddress) {
          throw new Error(SEAL_ADMIN_WALLET_REQUIRED_MESSAGE);
        }
        return "decrypted";
      }),
    };

    await expect(
      resolveSubmissionAnswers(form, createEncryptedSubmission(), walletAwareAdapter, {}),
    ).rejects.toMatchObject({
      reasonCode: "WALLET_NOT_CONNECTED",
    });
  });

  it("returns UNAUTHORIZED_WALLET when the wallet lacks access", async () => {
    const unauthorizedSealAdapter: SealAdapter = {
      encrypt: vi.fn(async (value) => value),
      decrypt: vi.fn(async () => {
        throw new Error(SEAL_PERMISSION_DENIED_MESSAGE);
      }),
    };

    await expect(
      resolveSubmissionAnswers(
        form,
        createEncryptedSubmission(),
        unauthorizedSealAdapter,
        { walletAddress: "0xreviewer" },
      ),
    ).rejects.toMatchObject({
      reasonCode: "UNAUTHORIZED_WALLET",
    });
  });

  it("returns ENCRYPTED_PAYLOAD_MISSING when the encrypted payload is absent", async () => {
    await expect(
      resolveSubmissionAnswers(
        form,
        createEncryptedSubmission({
          encryptedPayload: undefined,
          encryptedBlobId: undefined,
        }),
        fakeSealAdapter,
        { walletAddress: "0xreviewer" },
      ),
    ).rejects.toMatchObject({
      reasonCode: "ENCRYPTED_PAYLOAD_MISSING",
    });
  });
});
