import type { SealAdapter, SealDecryptContext, SealEncryptContext } from "../types";
import {
  DecryptDiagnosticError,
  type DecryptDiagnosticContext,
  validateEncryptedPayloadOrThrow,
} from "./decryptDiagnostics";
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
export const SEAL_UNAVAILABLE_MESSAGE = "Seal encryption is unavailable. Submission was not uploaded.";
export const LEGACY_UNENCRYPTED_RESPONSE_LABEL = "Legacy unencrypted response";
export const ENCRYPTION_REQUIRED_CODE = "ENCRYPTION_REQUIRED";
export const ENCRYPTION_FAILED_CODE = "ENCRYPTION_FAILED";

const requestedSealMode = String(import.meta.env.VITE_SEAL_MODE || "seal").toLowerCase();
const isProductionRuntime = import.meta.env.MODE === "production";
const hasSealEnv =
  Boolean(import.meta.env.VITE_SEAL_PACKAGE_ID) &&
  Boolean(import.meta.env.VITE_SEAL_KEY_SERVER_OBJECT_ID);
const sealUnavailableReason =
  requestedSealMode === "mock" && isProductionRuntime
    ? SEAL_UNAVAILABLE_MESSAGE
    : !hasSealEnv
      ? SEAL_UNAVAILABLE_MESSAGE
      : null;

export const sealServiceAdapter: SealAdapter = sealClientAdapter;

const runtimeStatus: SealRuntimeStatus = {
  requestedMode: "seal",
  activeMode: "seal",
  isFallback: false,
  warning:
    sealUnavailableReason ??
    (hasSealEnv ? null : "Seal env is incomplete. Encryption will fail closed."),
  canEncrypt: !sealUnavailableReason,
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

export interface DecryptSensitiveResponseOptions {
  allowLegacyUnencrypted?: boolean;
  encryptedMarker?: boolean;
  diagnostics?: DecryptDiagnosticContext;
}

function assertProductionSealAdapter(seal: SealAdapter) {
  if (isProductionRuntime && seal !== sealServiceAdapter) {
    throw new Error("Production Seal runtime must use the real Seal adapter.");
  }
}

function assertSealEncryptionAvailable() {
  if (sealUnavailableReason) {
    throw new Error(sealUnavailableReason);
  }
}

export function createEncryptionGuardError(
  code: typeof ENCRYPTION_REQUIRED_CODE | typeof ENCRYPTION_FAILED_CODE,
  message: string,
) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

export async function encryptSensitiveResponse(
  value: string,
  context: SealEncryptContext = {},
  seal: SealAdapter = sealServiceAdapter,
) {
  assertProductionSealAdapter(seal);
  assertSealEncryptionAvailable();
  try {
    const encrypted = await seal.encrypt(value, context);
    if (!parseRealSealEnvelope(encrypted)) {
      throw new Error("Seal adapter returned a non-Seal payload.");
    }
    return encrypted;
  } catch (error) {
    if (error instanceof Error && error.message === SEAL_UNAVAILABLE_MESSAGE) {
      throw error;
    }
    throw createEncryptionGuardError(ENCRYPTION_FAILED_CODE, ENCRYPTION_FAILED_MESSAGE);
  }
}

export async function decryptSensitiveResponse(
  value: string,
  context: SealDecryptContext = {},
  seal: SealAdapter = sealServiceAdapter,
  options: DecryptSensitiveResponseOptions = {},
) {
  assertProductionSealAdapter(seal);
  const envelope = parseRealSealEnvelope(value);
  if (!envelope) {
    if (options.allowLegacyUnencrypted && options.encryptedMarker !== true) {
      return {
        plaintext: value,
        legacyUnencrypted: true,
      };
    }
    validateEncryptedPayloadOrThrow(value, options.diagnostics);
    throw new DecryptDiagnosticError(
      "MANIFEST_MISMATCH",
      "Decrypt failed: MANIFEST_MISMATCH",
      options.diagnostics,
    );
  }
  const plaintext = await seal.decrypt(value, context);
  return {
    plaintext,
    legacyUnencrypted: false,
  };
}

export async function decryptLegacyUnencryptedResponse(
  value: string,
  context: SealDecryptContext = {},
  seal: SealAdapter = sealServiceAdapter,
) {
  return decryptSensitiveResponse(value, context, seal, {
    allowLegacyUnencrypted: true,
    encryptedMarker: false,
  });
}
