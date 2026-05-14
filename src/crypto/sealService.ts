import type { SealAdapter, SealDecryptContext, SealEncryptContext } from "../types";
import { sealClientAdapter } from "./sealClientAdapter";
import {
  parseRealSealEnvelope,
} from "./sealPayload";

export type SealRuntimeMode = "seal";

interface SealRuntimeStatus {
  requestedMode: SealRuntimeMode;
  activeMode: SealRuntimeMode;
  isFallback: false;
  warning: string | null;
  canEncrypt: boolean;
}

export const ENCRYPTION_FAILED_MESSAGE = "Encryption failed. Response was not submitted.";
export const LEGACY_UNENCRYPTED_RESPONSE_LABEL = "Legacy unencrypted response";

const hasSealEnv =
  Boolean(import.meta.env.VITE_SEAL_PACKAGE_ID) &&
  Boolean(import.meta.env.VITE_SEAL_KEY_SERVER_OBJECT_ID);

export const sealServiceAdapter: SealAdapter = sealClientAdapter;

const runtimeStatus: SealRuntimeStatus = {
  requestedMode: "seal",
  activeMode: "seal",
  isFallback: false,
  warning: hasSealEnv ? null : "Seal env is incomplete. Encryption will fail closed.",
  canEncrypt: hasSealEnv,
};

export function getSealRuntimeStatus() {
  return runtimeStatus;
}

export function isRealSealEncryptedPayload(value: string) {
  return Boolean(parseRealSealEnvelope(value));
}

export function isLegacyUnencryptedPayload(value: string | undefined | null) {
  return Boolean(value && !parseRealSealEnvelope(value));
}

export async function encryptSensitiveResponse(
  value: string,
  context: SealEncryptContext = {},
  seal: SealAdapter = sealServiceAdapter,
) {
  if (!hasSealEnv) {
    throw new Error(ENCRYPTION_FAILED_MESSAGE);
  }
  try {
    const encrypted = await seal.encrypt(value, context);
    if (!parseRealSealEnvelope(encrypted)) {
      throw new Error("Seal adapter returned a non-Seal payload.");
    }
    return encrypted;
  } catch {
    throw new Error(ENCRYPTION_FAILED_MESSAGE);
  }
}

export async function decryptSensitiveResponse(
  value: string,
  context: SealDecryptContext = {},
  seal: SealAdapter = sealServiceAdapter,
) {
  if (!parseRealSealEnvelope(value)) {
    return {
      plaintext: value,
      legacyUnencrypted: true,
    };
  }
  const plaintext = await seal.decrypt(value, context);
  return {
    plaintext,
    legacyUnencrypted: false,
  };
}
