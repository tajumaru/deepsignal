import {
  decryptSensitiveResponse,
  encryptSensitiveResponse,
  getSealRuntimeStatus,
  isLegacyUnencryptedPayload,
  isRealSealEncryptedPayload,
  sealServiceAdapter,
} from "../../crypto/sealService";
import type { SealAdapter, SealDecryptContext, SealEncryptContext } from "../../types";

export const activeSealAdapter: SealAdapter = sealServiceAdapter;

export async function encryptPayload(
  value: string,
  context: SealEncryptContext = {},
  seal: SealAdapter = activeSealAdapter,
) {
  return encryptSensitiveResponse(value, context, seal);
}

export async function decryptPayload(
  value: string,
  context: SealDecryptContext = {},
  seal: SealAdapter = activeSealAdapter,
) {
  return decryptSensitiveResponse(value, context, seal);
}

export {
  getSealRuntimeStatus,
  isLegacyUnencryptedPayload,
  isRealSealEncryptedPayload,
};

export * from "./accessPolicy";
export * from "./errors";
export {
  REAL_SEAL_SESSION_TTL_MIN,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_WALLET_CANCELLED_MESSAGE,
  parseRealSealEnvelope,
} from "../../crypto/sealPayload";
export type { SealAdapter, SealDecryptContext, SealEncryptContext };
