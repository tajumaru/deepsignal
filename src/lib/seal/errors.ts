import {
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_SESSION_EXPIRED_MESSAGE,
  SEAL_WALLET_CANCELLED_MESSAGE,
} from "../../crypto/sealPayload";
import { isDecryptDiagnosticError } from "../../crypto/decryptDiagnostics";

export type SealUiErrorCode =
  | "wallet_not_connected"
  | "unauthorized_wallet"
  | "session_expired"
  | "approval_required"
  | "policy_mismatch"
  | "manifest_mismatch"
  | "blob_fetch_failed"
  | "payload_missing"
  | "runtime_unavailable"
  | "unknown";

export interface SealUiError {
  code: SealUiErrorCode;
  message: string;
  cause?: unknown;
}

export function toSealUiError(error: unknown, fallbackMessage = "Unable to decrypt this private signal."): SealUiError {
  if (isDecryptDiagnosticError(error)) {
    switch (error.reasonCode) {
      case "WALLET_NOT_CONNECTED":
        return { code: "wallet_not_connected", message: "Connect wallet to unlock this signal.", cause: error };
      case "UNAUTHORIZED_WALLET":
        return { code: "unauthorized_wallet", message: "This wallet is not authorized to decrypt this response.", cause: error };
      case "SEAL_SESSION_EXPIRED":
        return { code: "session_expired", message: "Seal session expired. Please re-approve.", cause: error };
      case "SEAL_APPROVAL_REQUIRED":
        return { code: "approval_required", message: "Wallet approval is required to decrypt this response.", cause: error };
      case "POLICY_MISMATCH":
        return { code: "policy_mismatch", message: "Encryption policy mismatch.", cause: error };
      case "MANIFEST_MISMATCH":
        return { code: "manifest_mismatch", message: "Manifest mismatch detected.", cause: error };
      case "BLOB_FETCH_FAILED":
        return { code: "blob_fetch_failed", message: "Failed to fetch encrypted payload from Walrus.", cause: error };
      case "ENCRYPTED_PAYLOAD_MISSING":
        return { code: "payload_missing", message: "Encrypted payload is missing.", cause: error };
      case "SEAL_RUNTIME_UNAVAILABLE":
        return { code: "runtime_unavailable", message: "Seal runtime unavailable.", cause: error };
      default:
        return { code: "unknown", message: error.message || fallbackMessage, cause: error };
    }
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  if (message === SEAL_ADMIN_WALLET_REQUIRED_MESSAGE) {
    return { code: "wallet_not_connected", message: "Connect wallet to unlock this signal.", cause: error };
  }
  if (message === SEAL_PERMISSION_DENIED_MESSAGE) {
    return { code: "unauthorized_wallet", message: "This wallet is not authorized to decrypt this response.", cause: error };
  }
  if (message === SEAL_WALLET_CANCELLED_MESSAGE) {
    return { code: "approval_required", message: "Wallet approval is required to decrypt this response.", cause: error };
  }
  if (message === SEAL_SESSION_EXPIRED_MESSAGE) {
    return { code: "session_expired", message: "Seal session expired. Please re-approve.", cause: error };
  }
  return { code: "unknown", message, cause: error };
}
