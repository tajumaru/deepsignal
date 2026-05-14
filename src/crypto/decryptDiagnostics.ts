import { SUI_NETWORK, WALRUS_AGGREGATOR_URL } from "../lib/sui";
import type { FormSchema, SealDecryptContext, Submission } from "../types";
import {
  REAL_SEAL_ENVELOPE_KIND,
  REAL_SEAL_ENVELOPE_VERSION,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_NOT_CONFIGURED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE,
  SEAL_SUI_CLIENT_REQUIRED_MESSAGE,
  parseRealSealEnvelope,
  type RealSealEnvelope,
} from "./sealPayload";

export type DecryptFailureReasonCode =
  | "WALRUS_BLOB_FETCH_FAILED"
  | "MANIFEST_NOT_FOUND"
  | "INVALID_ENCRYPTED_PAYLOAD"
  | "WALLET_NOT_CONNECTED"
  | "WRONG_NETWORK"
  | "ACCESS_POLICY_MISMATCH"
  | "SEAL_CLIENT_ERROR"
  | "DECRYPTION_KEY_UNAVAILABLE"
  | "DECRYPTION_FAILED_UNKNOWN";

export interface DecryptDiagnosticContext {
  formId?: string;
  responseId?: string;
  manifestBlobId?: string;
  submissionBlobId?: string;
  encryptedBlobId?: string;
  network?: string;
  walletAddress?: string;
  packageId?: string;
  policyId?: string;
  accessObjectId?: string;
  approvalPolicy?: string;
  encryptedPayloadShape?: Record<string, unknown>;
  ciphertextSize?: number;
  timestamp?: string;
  gateway?: string;
  source?: string;
}

export class DecryptDiagnosticError extends Error {
  reasonCode: DecryptFailureReasonCode;
  diagnostics: DecryptDiagnosticContext;
  rawError?: unknown;

  constructor(
    reasonCode: DecryptFailureReasonCode,
    message: string,
    diagnostics: DecryptDiagnosticContext = {},
    rawError?: unknown,
  ) {
    super(message);
    this.name = "DecryptDiagnosticError";
    this.reasonCode = reasonCode;
    this.diagnostics = diagnostics;
    this.rawError = rawError;
  }
}

export function isDecryptDiagnosticError(error: unknown): error is DecryptDiagnosticError {
  return error instanceof DecryptDiagnosticError;
}

export function buildDecryptDiagnosticContext(
  form: FormSchema,
  submission: Submission,
  context: SealDecryptContext = {},
  overrides: Partial<DecryptDiagnosticContext> = {},
): DecryptDiagnosticContext {
  return {
    formId: form.id,
    responseId: submission.id,
    manifestBlobId: form.manifestBlobId,
    submissionBlobId: submission.blobId,
    encryptedBlobId: submission.encryptedBlobId,
    network: SUI_NETWORK,
    walletAddress: context.walletAddress,
    timestamp: new Date().toISOString(),
    gateway: WALRUS_AGGREGATOR_URL,
    source: submission.encryptedPayload ? "submission.inlineEncryptedPayload" : "storage.readEncryptedPayload",
    ...overrides,
  };
}

export function serializeDecryptError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: "cause" in error ? error.cause : undefined,
      rawError:
        error instanceof DecryptDiagnosticError && error.rawError
          ? serializeDecryptError(error.rawError)
          : undefined,
    };
  }
  return {
    name: typeof error,
    message: String(error),
    rawError: error,
  };
}

export function logDecryptDiagnostic(
  event: "start" | "payload_validated" | "walrus_fetch_failed" | "failure" | "success",
  diagnostics: DecryptDiagnosticContext,
  error?: unknown,
) {
  console.debug("[decrypt-diagnostic]", event, {
    ...diagnostics,
    timestamp: diagnostics.timestamp ?? new Date().toISOString(),
    error: error === undefined ? undefined : serializeDecryptError(error),
  });
}

export function describeEncryptedPayloadShape(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      json: true,
      kind: parsed.kind,
      version: parsed.version,
      algorithm: parsed.algorithm,
      encoding: parsed.encoding,
      hasPackageId: typeof parsed.packageId === "string" && parsed.packageId.length > 0,
      hasObjectId: typeof parsed.objectId === "string" && parsed.objectId.length > 0,
      hasEncryptedObject: typeof parsed.encryptedObject === "string" && parsed.encryptedObject.length > 0,
      hasServerObjectIds: Array.isArray(parsed.serverObjectIds) && parsed.serverObjectIds.length > 0,
      approvalPolicy: parsed.approvalPolicy,
      projectScoped: typeof parsed.projectId === "string" && parsed.projectId.length > 0,
      keys: Object.keys(parsed).sort(),
    };
  } catch {
    return {
      json: false,
      bytes: value.length,
      prefix: value.slice(0, 24),
    };
  }
}

export function validateEncryptedPayloadOrThrow(
  value: string,
  diagnostics: DecryptDiagnosticContext = {},
): RealSealEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new DecryptDiagnosticError(
      "INVALID_ENCRYPTED_PAYLOAD",
      "Encrypted payload is not valid JSON.",
      {
        ...diagnostics,
        encryptedPayloadShape: describeEncryptedPayloadShape(value),
        ciphertextSize: value.length,
      },
      error,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new DecryptDiagnosticError(
      "INVALID_ENCRYPTED_PAYLOAD",
      "Encrypted payload is not a JSON object.",
      {
        ...diagnostics,
        encryptedPayloadShape: describeEncryptedPayloadShape(value),
        ciphertextSize: value.length,
      },
    );
  }

  const candidate = parsed as Record<string, unknown>;
  const hasRequiredEnvelopeFields =
    candidate.kind === REAL_SEAL_ENVELOPE_KIND &&
    candidate.version === REAL_SEAL_ENVELOPE_VERSION &&
    candidate.algorithm === "@mysten/seal" &&
    candidate.encoding === "base64" &&
    typeof candidate.packageId === "string" &&
    candidate.packageId.length > 0 &&
    typeof candidate.objectId === "string" &&
    candidate.objectId.length > 0 &&
    typeof candidate.encryptedObject === "string" &&
    candidate.encryptedObject.length > 0 &&
    Array.isArray(candidate.serverObjectIds) &&
    candidate.serverObjectIds.length > 0;

  const envelope = parseRealSealEnvelope(value);
  if (!hasRequiredEnvelopeFields || !envelope) {
    throw new DecryptDiagnosticError(
      "INVALID_ENCRYPTED_PAYLOAD",
      "Encrypted payload envelope is missing required Seal fields or uses an unsupported version.",
      {
        ...diagnostics,
        encryptedPayloadShape: describeEncryptedPayloadShape(value),
        ciphertextSize: value.length,
      },
    );
  }
  return envelope;
}

export function classifyDecryptError(error: unknown): DecryptFailureReasonCode {
  if (error instanceof DecryptDiagnosticError) {
    return error.reasonCode;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message === SEAL_ADMIN_WALLET_REQUIRED_MESSAGE) {
    return "WALLET_NOT_CONNECTED";
  }
  if (message === SEAL_PERMISSION_DENIED_MESSAGE || /noaccess|permission|unauthori[sz]ed|access/i.test(message)) {
    return "ACCESS_POLICY_MISMATCH";
  }
  if (message === SEAL_NOT_CONFIGURED_MESSAGE || message === SEAL_SUI_CLIENT_REQUIRED_MESSAGE) {
    return "SEAL_CLIENT_ERROR";
  }
  if (message === SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE) {
    return "ACCESS_POLICY_MISMATCH";
  }
  if (/network|chain|mainnet|testnet/i.test(message)) {
    return "WRONG_NETWORK";
  }
  if (/key|session|signature|approval|decrypt/i.test(message)) {
    return "DECRYPTION_KEY_UNAVAILABLE";
  }
  return "DECRYPTION_FAILED_UNKNOWN";
}
