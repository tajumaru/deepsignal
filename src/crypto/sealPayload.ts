export const REAL_SEAL_ENVELOPE_KIND = "deepsignal.real-seal";
export const REAL_SEAL_ENVELOPE_VERSION = 1;
export const REAL_SEAL_SESSION_TTL_MIN = 10;
export const REAL_SEAL_SCHEMA_VERSION = 1;

export const SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE =
  "Seal decryption requires wallet approval.";

export const REAL_SEAL_MODE_REQUIRED_MESSAGE =
  "This payload was encrypted with real Seal. Enable seal mode and connect a wallet to decrypt it.";

export const SEAL_ADMIN_WALLET_REQUIRED_MESSAGE =
  "Admin wallet required.";

export const SEAL_NOT_CONFIGURED_MESSAGE =
  "Seal mode is not configured.";

export const SEAL_RUNTIME_UNAVAILABLE_MESSAGE =
  "Seal runtime unavailable.";

export const SEAL_WALLET_CANCELLED_MESSAGE =
  "Wallet approval was cancelled.";

export const SEAL_SESSION_EXPIRED_MESSAGE =
  "Seal session expired.";

export const SEAL_PERMISSION_DENIED_MESSAGE =
  "You do not have permission to decrypt this signal.";

export const SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE =
  "This private signal needs a project-backed or owner-wallet Seal policy.";

export const SEAL_SUI_CLIENT_REQUIRED_MESSAGE =
  "Seal decrypt requires a Sui client.";

export type RealSealApprovalPolicy =
  | "project_signal_v1"
  | "project_admin_v0"
  | "owner_wallet_v1";

export type ProjectSealApprovalPolicy =
  | "project_signal_v1"
  | "project_admin_v0"
  | "project_signal_reviewer_v1"
  | "project_reviewer_v0";

export type SealApprovalPolicy = ProjectSealApprovalPolicy | "owner_wallet_v1";

export interface SealPolicySnapshot {
  policyHash: string;
  packageId: string;
  network: string;
  capabilityType: string;
  objectId: string;
  policyId: RealSealApprovalPolicy | string;
  policyObjectId: string;
  projectId?: string;
  ownerAddress?: string;
  walletAddress?: string;
  serverObjectIds: string[];
  rawPolicyJson: string;
  normalizedPolicyJson: string;
}

export interface RealSealEnvelope {
  kind: typeof REAL_SEAL_ENVELOPE_KIND;
  version: typeof REAL_SEAL_ENVELOPE_VERSION;
  schemaVersion: typeof REAL_SEAL_SCHEMA_VERSION;
  envelopeVersion: typeof REAL_SEAL_ENVELOPE_VERSION;
  algorithm: "@mysten/seal";
  encoding: "base64";
  network: string;
  packageId: string;
  objectId: string;
  threshold: number;
  serverObjectIds: string[];
  encryptedObject: string;
  policyId: SealApprovalPolicy;
  policyObjectId: string;
  projectId?: string;
  ownerAddress?: string;
  approvalPolicy?: SealApprovalPolicy;
  encryptPolicySnapshot?: SealPolicySnapshot;
  createdAt: string;
}

export function createRealSealEnvelope(
  input: Omit<RealSealEnvelope, "kind" | "version" | "schemaVersion" | "envelopeVersion" | "algorithm" | "encoding" | "createdAt">,
) {
  return {
    kind: REAL_SEAL_ENVELOPE_KIND,
    version: REAL_SEAL_ENVELOPE_VERSION,
    schemaVersion: REAL_SEAL_SCHEMA_VERSION,
    envelopeVersion: REAL_SEAL_ENVELOPE_VERSION,
    algorithm: "@mysten/seal",
    encoding: "base64" as const,
    createdAt: new Date().toISOString(),
    ...input,
  } satisfies RealSealEnvelope;
}

export function parseRealSealEnvelope(value: string): RealSealEnvelope | null {
  try {
    const parsed = JSON.parse(value) as Partial<RealSealEnvelope>;
    if (
      parsed.kind !== REAL_SEAL_ENVELOPE_KIND ||
      parsed.version !== REAL_SEAL_ENVELOPE_VERSION ||
      (parsed.schemaVersion !== undefined && parsed.schemaVersion !== REAL_SEAL_SCHEMA_VERSION) ||
      (parsed.envelopeVersion !== undefined && parsed.envelopeVersion !== REAL_SEAL_ENVELOPE_VERSION) ||
      parsed.algorithm !== "@mysten/seal" ||
      parsed.encoding !== "base64" ||
      (parsed.network !== undefined && typeof parsed.network !== "string") ||
      typeof parsed.packageId !== "string" ||
      typeof parsed.objectId !== "string" ||
      typeof parsed.threshold !== "number" ||
      !Array.isArray(parsed.serverObjectIds) ||
      parsed.serverObjectIds.some((item) => typeof item !== "string") ||
      typeof parsed.encryptedObject !== "string" ||
      (parsed.policyId !== undefined &&
        parsed.policyId !== "project_signal_v1" &&
        parsed.policyId !== "project_admin_v0" &&
        parsed.policyId !== "project_signal_reviewer_v1" &&
        parsed.policyId !== "project_reviewer_v0" &&
        parsed.policyId !== "owner_wallet_v1") ||
      (parsed.policyObjectId !== undefined && typeof parsed.policyObjectId !== "string") ||
      (parsed.projectId !== undefined && typeof parsed.projectId !== "string") ||
      (parsed.ownerAddress !== undefined && typeof parsed.ownerAddress !== "string") ||
      (parsed.approvalPolicy !== undefined &&
        parsed.approvalPolicy !== "project_signal_v1" &&
        parsed.approvalPolicy !== "project_admin_v0" &&
        parsed.approvalPolicy !== "project_signal_reviewer_v1" &&
        parsed.approvalPolicy !== "project_reviewer_v0" &&
        parsed.approvalPolicy !== "owner_wallet_v1") ||
      (parsed.encryptPolicySnapshot !== undefined &&
        (typeof parsed.encryptPolicySnapshot !== "object" || parsed.encryptPolicySnapshot === null)) ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    const normalizedPolicyId = parsed.policyId ?? parsed.approvalPolicy;
    const normalizedPolicyObjectId =
      parsed.policyObjectId ??
      parsed.projectId ??
      parsed.ownerAddress ??
      parsed.objectId;
    const normalizedNetwork = parsed.network ?? "";
    const normalizedSchemaVersion = parsed.schemaVersion ?? parsed.version;
    const normalizedEnvelopeVersion = parsed.envelopeVersion ?? parsed.version;
    if (
      !normalizedPolicyId ||
      !normalizedPolicyObjectId ||
      !normalizedNetwork ||
      typeof normalizedSchemaVersion !== "number" ||
      typeof normalizedEnvelopeVersion !== "number"
    ) {
      return null;
    }
    return {
      ...parsed,
      schemaVersion: normalizedSchemaVersion,
      envelopeVersion: normalizedEnvelopeVersion,
      network: normalizedNetwork,
      policyId: normalizedPolicyId,
      policyObjectId: normalizedPolicyObjectId,
      approvalPolicy: parsed.approvalPolicy ?? normalizedPolicyId,
    } as RealSealEnvelope;
  } catch {
    return null;
  }
}

export function normalizeSealIdentifier(value?: string | null) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

export function normalizeOptionalSealIdentifier(value?: string | null) {
  const normalized = normalizeSealIdentifier(value);
  return normalized || undefined;
}

export function getSealPolicyCapabilityType(policyId?: string) {
  switch (policyId) {
    case "owner_wallet_v1":
      return "Owner wallet";
    case "project_signal_reviewer_v1":
    case "project_reviewer_v0":
      return "ReviewerCap";
    case "project_signal_v1":
    case "project_admin_v0":
      return "OwnerCap/AdminCap";
    default:
      return "Unknown";
  }
}

export function selectProjectSealApprovalPolicy({
  envelopeApprovalPolicy,
  objectId,
  projectId,
  reviewerCapId,
}: {
  envelopeApprovalPolicy?: ProjectSealApprovalPolicy | string;
  objectId: string;
  projectId: string;
  reviewerCapId?: string;
}): ProjectSealApprovalPolicy {
  const isProjectScopedSignal = safelyDoesSealIdMatchProject(objectId, projectId);
  if (reviewerCapId) {
    return isProjectScopedSignal ? "project_signal_reviewer_v1" : "project_reviewer_v0";
  }
  if (
    envelopeApprovalPolicy === "project_signal_v1" ||
    envelopeApprovalPolicy === "project_admin_v0" ||
    envelopeApprovalPolicy === "project_signal_reviewer_v1" ||
    envelopeApprovalPolicy === "project_reviewer_v0"
  ) {
    return envelopeApprovalPolicy;
  }
  return isProjectScopedSignal ? "project_signal_v1" : "project_admin_v0";
}

function safelyDoesSealIdMatchProject(objectId: string, projectId: string) {
  try {
    return doesSealIdMatchProject(objectId, projectId);
  } catch {
    return false;
  }
}

export function stableSerializePolicy(value: Record<string, unknown>): string {
  return JSON.stringify(sortPolicyValue(value));
}

export function hashSealPolicyJson(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createSealPolicySnapshot(input: {
  packageId: string;
  network: string;
  objectId: string;
  policyId: SealApprovalPolicy | string;
  policyObjectId: string;
  projectId?: string;
  ownerAddress?: string;
  walletAddress?: string;
  serverObjectIds?: string[];
  capabilityType?: string;
}) {
  const packageId = normalizeSealIdentifier(input.packageId);
  const objectId = normalizeSealIdentifier(input.objectId);
  const policyObjectId = normalizeSealIdentifier(input.policyObjectId);
  const projectId = normalizeOptionalSealIdentifier(input.projectId);
  const ownerAddress = normalizeOptionalSealIdentifier(input.ownerAddress);
  const walletAddress = normalizeOptionalSealIdentifier(input.walletAddress);
  const serverObjectIds = (input.serverObjectIds ?? []).map(normalizeSealIdentifier).filter(Boolean);
  const snapshotInput = {
    packageId,
    network: input.network,
    objectId,
    policyId: input.policyId,
    policyObjectId,
    projectId,
    ownerAddress,
    serverObjectIds,
    capabilityType: input.capabilityType ?? getSealPolicyCapabilityType(input.policyId),
  };
  const rawPolicyJson = JSON.stringify(sortPolicyValue(snapshotInput), null, 2);
  const normalizedPolicyJson = stableSerializePolicy(snapshotInput);
  return {
    ...snapshotInput,
    walletAddress,
    rawPolicyJson,
    policyHash: hashSealPolicyJson(normalizedPolicyJson),
    normalizedPolicyJson,
  } satisfies SealPolicySnapshot;
}

function sortPolicyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortPolicyValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortPolicyValue(item)]),
  );
}

export function toBase64(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function createProjectScopedSealId(projectId: string) {
  const projectBytes = hexToBytes(projectId);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const merged = new Uint8Array(projectBytes.length + nonceBytes.length);
  merged.set(projectBytes, 0);
  merged.set(nonceBytes, projectBytes.length);
  return toHex(merged);
}

export function createOwnerScopedSealId(ownerAddress: string) {
  const ownerBytes = hexToBytes(ownerAddress);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const merged = new Uint8Array(ownerBytes.length + nonceBytes.length);
  merged.set(ownerBytes, 0);
  merged.set(nonceBytes, ownerBytes.length);
  return toHex(merged);
}

export function doesSealIdMatchProject(objectId: string, projectId: string) {
  const objectBytes = hexToBytes(objectId);
  const projectBytes = hexToBytes(projectId);
  if (objectBytes.length < projectBytes.length) {
    return false;
  }
  return projectBytes.every((byte, index) => objectBytes[index] === byte);
}

export function doesSealIdMatchOwner(objectId: string, ownerAddress: string) {
  const objectBytes = hexToBytes(objectId);
  const ownerBytes = hexToBytes(ownerAddress);
  if (objectBytes.length < ownerBytes.length) {
    return false;
  }
  return ownerBytes.every((byte, index) => objectBytes[index] === byte);
}

export function isLikelyWalletCancelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel|reject|declin|denied|aborted/i.test(message);
}

function hexToBytes(value: string) {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (normalized.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${value}`);
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array) {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
