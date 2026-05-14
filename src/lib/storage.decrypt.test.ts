import { describe, expect, it, vi } from "vitest";
import type { FormSchema, SealAdapter } from "../types";
import { decryptSensitiveAnswers } from "./storage";

const fakeSealAdapter: SealAdapter = {
  encrypt: vi.fn(async (value) => value),
  decrypt: vi.fn(async () => "decrypted"),
};

const form: FormSchema = {
  id: "form-1",
  title: "Form",
  description: "",
  createdAt: new Date(0).toISOString(),
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
      reasonCode: "INVALID_ENCRYPTED_PAYLOAD",
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
      reasonCode: "INVALID_ENCRYPTED_PAYLOAD",
    });
  });
});
