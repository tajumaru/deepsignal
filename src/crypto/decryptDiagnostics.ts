import { SUI_NETWORK, WALRUS_AGGREGATOR_URL } from "../lib/sui";
import type { FormSchema, SealDecryptContext, Submission } from "../types";
import {
  REAL_SEAL_ENVELOPE_VERSION,
  REAL_SEAL_ENVELOPE_KIND,
  REAL_SEAL_SCHEMA_VERSION,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_NOT_CONFIGURED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE,
  SEAL_RUNTIME_UNAVAILABLE_MESSAGE,
  SEAL_SESSION_EXPIRED_MESSAGE,
  SEAL_SUI_CLIENT_REQUIRED_MESSAGE,
  SEAL_WALLET_CANCELLED_MESSAGE,
  parseRealSealEnvelope,
  createSealPolicySnapshot,
  getSealPolicyCapabilityType,
  normalizeOptionalSealIdentifier,
  normalizeSealIdentifier,
  selectProjectSealApprovalPolicy,
  type SealPolicySnapshot,
  type RealSealEnvelope,
} from "./sealPayload";

export type DecryptFailureReasonCode =
  | "WALLET_NOT_CONNECTED"
  | "UNAUTHORIZED_WALLET"
  | "SEAL_SESSION_EXPIRED"
  | "SEAL_APPROVAL_REQUIRED"
  | "POLICY_MISMATCH"
  | "MANIFEST_MISMATCH"
  | "BLOB_FETCH_FAILED"
  | "ENCRYPTED_PAYLOAD_MISSING"
  | "SEAL_RUNTIME_UNAVAILABLE"
  | "UNKNOWN_DECRYPT_ERROR";

export interface DecryptDiagnosticContext {
  formId?: string;
  responseId?: string;
  manifestBlobId?: string;
  submissionBlobId?: string;
  encryptedBlobId?: string;
  receiptBlobId?: string;
  network?: string;
  walletAddress?: string;
  packageId?: string;
  policyId?: string;
  policyHash?: string;
  capabilityType?: string;
  accessObjectId?: string;
  policyObjectId?: string;
  approvalPolicy?: string;
  encryptPolicySnapshot?: SealPolicySnapshot;
  decryptPolicySnapshot?: SealPolicySnapshot;
  normalizedPolicyJson?: string;
  policySerializationOutput?: string;
  policySnapshotComparison?: {
    matches: boolean;
    differingKeys: string[];
    diffs: Array<{
      key: string;
      encryptValue: unknown;
      decryptValue: unknown;
    }>;
  };
  requiredCapabilityObjects?: Array<{
    type: string;
    objectId?: string;
  }>;
  objectIdSources?: Array<{
    label: string;
    objectId?: string;
    source: string;
    type?: string;
  }>;
  ownedCapabilityObjects?: Array<{
    type: string;
    objectId: string;
    registryId?: string;
  }>;
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
    receiptBlobId: submission.receiptBlobId,
    network: SUI_NETWORK,
    walletAddress: normalizeOptionalSealIdentifier(context.walletAddress),
    timestamp: new Date().toISOString(),
    gateway: WALRUS_AGGREGATOR_URL,
    source: submission.encryptedPayload ? "submission.inlineEncryptedPayload" : "storage.readEncryptedPayload",
    ownedCapabilityObjects: context.ownedCapabilityObjects,
    objectIdSources: [
      ...((context.ownedCapabilityObjects ?? []).map((object) => ({
        label: "wallet owned capability",
        objectId: object.objectId,
        source: "wallet owned objects",
        type: object.type,
      }))),
      {
        label: "form project ID",
        objectId: form.projectId,
        source: "form metadata",
        type: "Project",
      },
      {
        label: "form owner address",
        objectId: form.ownerAddress,
        source: "form metadata",
        type: "Owner wallet",
      },
      {
        label: "submission Seal identity",
        objectId: parseRealSealIdentityObjectId(submission.sealIdentity),
        source: submission.encryptedPayload ? "local cache" : "form metadata",
        type: "Seal encrypted object",
      },
    ].filter((entry) => entry.objectId),
    ...overrides,
  };
}

function parseRealSealIdentityObjectId(value?: string) {
  const [, , objectId] = value?.split(":") ?? [];
  return objectId;
}

export function buildSealDecryptPolicySnapshot(input: {
  envelope: RealSealEnvelope;
  context?: SealDecryptContext;
  approvalPolicy?: string;
}) {
  const projectId = normalizeOptionalSealIdentifier(input.envelope.projectId ?? input.context?.projectId);
  const ownerAddress = normalizeOptionalSealIdentifier(input.envelope.ownerAddress ?? input.context?.ownerAddress);
  const envelopePolicyId = input.approvalPolicy ?? input.envelope.approvalPolicy ?? input.envelope.policyId;
  const policyId = projectId
    ? selectProjectSealApprovalPolicy({
        envelopeApprovalPolicy: envelopePolicyId,
        objectId: input.envelope.objectId,
        projectId,
      })
    : envelopePolicyId;
  const policyObjectId = normalizeSealIdentifier(input.envelope.policyObjectId ?? projectId ?? ownerAddress ?? input.envelope.objectId);
  return createSealPolicySnapshot({
    network: SUI_NETWORK,
    packageId: input.envelope.packageId,
    objectId: input.envelope.objectId,
    policyId,
    policyObjectId,
    projectId,
    ownerAddress,
    walletAddress: input.context?.walletAddress,
    serverObjectIds: input.envelope.serverObjectIds,
    capabilityType: getSealPolicyCapabilityType(policyId),
  });
}

export function buildSealEncryptPolicySnapshotFromEnvelope(envelope: RealSealEnvelope) {
  return createSealPolicySnapshot({
    network: envelope.network,
    packageId: envelope.packageId,
    objectId: envelope.objectId,
    policyId: envelope.policyId,
    policyObjectId: envelope.policyObjectId,
    projectId: envelope.projectId,
    ownerAddress: envelope.ownerAddress,
    walletAddress: envelope.ownerAddress,
    serverObjectIds: envelope.serverObjectIds,
    capabilityType: getSealPolicyCapabilityType(envelope.policyId),
  });
}

export function normalizeStoredSealPolicySnapshot(
  snapshot: SealPolicySnapshot | undefined,
): SealPolicySnapshot | undefined {
  if (!snapshot) {
    return undefined;
  }
  return createSealPolicySnapshot({
    network: snapshot.network,
    packageId: snapshot.packageId,
    objectId: snapshot.objectId,
    policyId: snapshot.policyId,
    policyObjectId: snapshot.policyObjectId,
    projectId: snapshot.projectId,
    ownerAddress: snapshot.ownerAddress,
    walletAddress: snapshot.walletAddress,
    serverObjectIds: snapshot.serverObjectIds,
    capabilityType: snapshot.capabilityType,
  });
}

export function compareSealPolicySnapshots(
  encryptPolicySnapshot?: SealPolicySnapshot,
  decryptPolicySnapshot?: SealPolicySnapshot,
) {
  if (!encryptPolicySnapshot || !decryptPolicySnapshot) {
    return undefined;
  }
  const keys = [
    "policyHash",
    "packageId",
    "network",
    "capabilityType",
    "objectId",
    "policyId",
    "policyObjectId",
    "projectId",
    "ownerAddress",
    "normalizedPolicyJson",
  ] as const;
  const diffs: Array<{ key: string; encryptValue: unknown; decryptValue: unknown }> = [];
  keys.forEach((key) => {
    if (encryptPolicySnapshot[key] !== decryptPolicySnapshot[key]) {
      diffs.push({
        key,
        encryptValue: encryptPolicySnapshot[key],
        decryptValue: decryptPolicySnapshot[key],
      });
    }
  });
  if (
    encryptPolicySnapshot.walletAddress &&
    encryptPolicySnapshot.walletAddress !== decryptPolicySnapshot.walletAddress
  ) {
    diffs.push({
      key: "walletAddress",
      encryptValue: encryptPolicySnapshot.walletAddress,
      decryptValue: decryptPolicySnapshot.walletAddress,
    });
  }
  if (encryptPolicySnapshot.serverObjectIds.join("\n") !== decryptPolicySnapshot.serverObjectIds.join("\n")) {
    diffs.push({
      key: "serverObjectIds",
      encryptValue: encryptPolicySnapshot.serverObjectIds,
      decryptValue: decryptPolicySnapshot.serverObjectIds,
    });
  }
  const differingKeys = diffs.map((diff) => diff.key);
  return {
    matches: differingKeys.length === 0,
    differingKeys,
    diffs,
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
      schemaVersion: parsed.schemaVersion,
      envelopeVersion: parsed.envelopeVersion,
      algorithm: parsed.algorithm,
      encoding: parsed.encoding,
      network: parsed.network,
      hasPackageId: typeof parsed.packageId === "string" && parsed.packageId.length > 0,
      hasObjectId: typeof parsed.objectId === "string" && parsed.objectId.length > 0,
      hasEncryptedObject: typeof parsed.encryptedObject === "string" && parsed.encryptedObject.length > 0,
      hasServerObjectIds: Array.isArray(parsed.serverObjectIds) && parsed.serverObjectIds.length > 0,
      policyId: parsed.policyId,
      hasPolicyObjectId: typeof parsed.policyObjectId === "string" && parsed.policyObjectId.length > 0,
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
      "MANIFEST_MISMATCH",
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
      "MANIFEST_MISMATCH",
      "Encrypted payload is not a JSON object.",
      {
        ...diagnostics,
        encryptedPayloadShape: describeEncryptedPayloadShape(value),
        ciphertextSize: value.length,
      },
    );
  }

  const candidate = parsed as Record<string, unknown>;
  const normalizedSchemaVersion =
    typeof candidate.schemaVersion === "number"
      ? candidate.schemaVersion
      : typeof candidate.version === "number"
        ? candidate.version
        : null;
  const normalizedEnvelopeVersion =
    typeof candidate.envelopeVersion === "number"
      ? candidate.envelopeVersion
      : typeof candidate.version === "number"
        ? candidate.version
        : null;
  const normalizedPolicyId =
    typeof candidate.policyId === "string"
      ? candidate.policyId
      : typeof candidate.approvalPolicy === "string"
        ? candidate.approvalPolicy
        : null;
  const normalizedPolicyObjectId =
    typeof candidate.policyObjectId === "string"
      ? candidate.policyObjectId
      : typeof candidate.projectId === "string"
        ? candidate.projectId
        : typeof candidate.ownerAddress === "string"
          ? candidate.ownerAddress
          : typeof candidate.objectId === "string"
            ? candidate.objectId
            : null;
  const hasRequiredEnvelopeFields =
    candidate.kind === REAL_SEAL_ENVELOPE_KIND &&
    normalizedSchemaVersion === REAL_SEAL_SCHEMA_VERSION &&
    normalizedEnvelopeVersion === REAL_SEAL_ENVELOPE_VERSION &&
    candidate.algorithm === "@mysten/seal" &&
    candidate.encoding === "base64" &&
    typeof candidate.network === "string" &&
    candidate.network.length > 0 &&
    typeof candidate.packageId === "string" &&
    candidate.packageId.length > 0 &&
    typeof candidate.objectId === "string" &&
    candidate.objectId.length > 0 &&
    typeof candidate.encryptedObject === "string" &&
    candidate.encryptedObject.length > 0 &&
    Array.isArray(candidate.serverObjectIds) &&
    candidate.serverObjectIds.length > 0 &&
    typeof normalizedPolicyId === "string" &&
    normalizedPolicyId.length > 0 &&
    typeof normalizedPolicyObjectId === "string" &&
    normalizedPolicyObjectId.length > 0;

  const envelope = parseRealSealEnvelope(value);
  if (!hasRequiredEnvelopeFields || !envelope) {
    throw new DecryptDiagnosticError(
      typeof normalizedPolicyId === "string" && normalizedPolicyId.length > 0 ? "MANIFEST_MISMATCH" : "POLICY_MISMATCH",
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
  if (message === SEAL_PERMISSION_DENIED_MESSAGE || /noaccess|permission|unauthori[sz]ed/i.test(message)) {
    return "UNAUTHORIZED_WALLET";
  }
  if (
    message === SEAL_RUNTIME_UNAVAILABLE_MESSAGE ||
    message === SEAL_NOT_CONFIGURED_MESSAGE ||
    message === SEAL_SUI_CLIENT_REQUIRED_MESSAGE
  ) {
    return "SEAL_RUNTIME_UNAVAILABLE";
  }
  if (message === SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE) {
    return "POLICY_MISMATCH";
  }
  if (message === SEAL_SESSION_EXPIRED_MESSAGE || /session.*expired|expired.*session/i.test(message)) {
    return "SEAL_SESSION_EXPIRED";
  }
  if (message === SEAL_WALLET_CANCELLED_MESSAGE || /approval|required|signature|wallet approval|cancel/i.test(message)) {
    return "SEAL_APPROVAL_REQUIRED";
  }
  if (/network|chain|mainnet|testnet|policy|manifest|envelope/i.test(message)) {
    return "POLICY_MISMATCH";
  }
  return "UNKNOWN_DECRYPT_ERROR";
}
