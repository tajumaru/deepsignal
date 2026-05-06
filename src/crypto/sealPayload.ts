export const REAL_SEAL_ENVELOPE_KIND = "deepsignal.real-seal";
export const REAL_SEAL_ENVELOPE_VERSION = 1;

export const SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE =
  "Seal decryption requires wallet approval.";

export const REAL_SEAL_MODE_REQUIRED_MESSAGE =
  "This payload was encrypted with real Seal. Enable seal mode and connect a wallet to decrypt it.";

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
