export const REAL_SEAL_ENVELOPE_KIND = "deepsignal.real-seal";
export const REAL_SEAL_ENVELOPE_VERSION = 1;
export const REAL_SEAL_SESSION_TTL_MIN = 10;

export const SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE =
  "Seal decryption requires wallet approval.";

export const REAL_SEAL_MODE_REQUIRED_MESSAGE =
  "This payload was encrypted with real Seal. Enable seal mode and connect a wallet to decrypt it.";

export const SEAL_ADMIN_WALLET_REQUIRED_MESSAGE =
  "Admin wallet required.";

export const SEAL_NOT_CONFIGURED_MESSAGE =
  "Seal mode is not configured.";

export const SEAL_WALLET_CANCELLED_MESSAGE =
  "Wallet approval was cancelled.";

export const SEAL_PERMISSION_DENIED_MESSAGE =
  "You do not have permission to decrypt this signal.";

export const SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE =
  "This private signal needs a project-backed Seal policy.";

export const SEAL_SUI_CLIENT_REQUIRED_MESSAGE =
  "Seal decrypt requires a Sui client.";

export type RealSealApprovalPolicy =
  | "project_signal_v1"
  | "project_admin_v0";

export interface RealSealEnvelope {
  kind: typeof REAL_SEAL_ENVELOPE_KIND;
  version: typeof REAL_SEAL_ENVELOPE_VERSION;
  algorithm: "@mysten/seal";
  encoding: "base64";
  packageId: string;
  objectId: string;
  threshold: number;
  serverObjectIds: string[];
  encryptedObject: string;
  projectId?: string;
  approvalPolicy?: RealSealApprovalPolicy;
  createdAt: string;
}

export function createRealSealEnvelope(
  input: Omit<RealSealEnvelope, "kind" | "version" | "algorithm" | "encoding" | "createdAt">,
) {
  return {
    kind: REAL_SEAL_ENVELOPE_KIND,
    version: REAL_SEAL_ENVELOPE_VERSION,
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
      parsed.algorithm !== "@mysten/seal" ||
      parsed.encoding !== "base64" ||
      typeof parsed.packageId !== "string" ||
      typeof parsed.objectId !== "string" ||
      typeof parsed.threshold !== "number" ||
      !Array.isArray(parsed.serverObjectIds) ||
      parsed.serverObjectIds.some((item) => typeof item !== "string") ||
      typeof parsed.encryptedObject !== "string" ||
      (parsed.projectId !== undefined && typeof parsed.projectId !== "string") ||
      (parsed.approvalPolicy !== undefined &&
        parsed.approvalPolicy !== "project_signal_v1" &&
        parsed.approvalPolicy !== "project_admin_v0") ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    return parsed as RealSealEnvelope;
  } catch {
    return null;
  }
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

export function doesSealIdMatchProject(objectId: string, projectId: string) {
  const objectBytes = hexToBytes(objectId);
  const projectBytes = hexToBytes(projectId);
  if (objectBytes.length < projectBytes.length) {
    return false;
  }
  return projectBytes.every((byte, index) => objectBytes[index] === byte);
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
