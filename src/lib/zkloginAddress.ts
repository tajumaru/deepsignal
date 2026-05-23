import { computeZkLoginAddress, decodeJwt } from "@mysten/sui/zklogin";

const DEFAULT_SALT_NAMESPACE = "deepsignal.zklogin.salt.v1";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function createDeterministicFallbackSalt(input: { iss: string; aud: string; sub: string }) {
  const saltHex = await sha256Hex(`${DEFAULT_SALT_NAMESPACE}:${input.iss}:${input.aud}:${input.sub}`);
  return BigInt(`0x${saltHex}`).toString(10);
}

async function fetchStableSalt(claims: { iss: string; aud: string; sub: string }) {
  const url = String(import.meta.env.VITE_ZKLOGIN_SALT_SERVICE_URL || "").trim();
  if (!url) {
    return createDeterministicFallbackSalt(claims);
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "google",
      iss: claims.iss,
      aud: claims.aud,
      sub: claims.sub,
    }),
  });
  const payload = (await response.json()) as {
    salt?: string;
    userSalt?: string;
    data?: {
      salt?: string;
      userSalt?: string;
    };
    error?: string;
  };
  const userSalt = payload.userSalt ?? payload.salt ?? payload.data?.userSalt ?? payload.data?.salt;
  if (!response.ok || !userSalt) {
    throw new Error(payload.error || "zkLogin salt service did not return a salt.");
  }
  return userSalt;
}

export interface DerivedZkLoginIdentity {
  iss: string;
  aud: string;
  address: string;
  subHash: string;
  expiresAt: string;
}

export async function deriveZkLoginIdentityFromIdToken(idToken: string, expectedNonce: string) {
  const decoded = decodeJwt(idToken);
  const nonce = (decoded as { nonce?: unknown }).nonce;
  if (typeof nonce !== "string" || nonce !== expectedNonce) {
    throw new Error("zkLogin nonce validation failed.");
  }
  const userSalt = await fetchStableSalt({
    iss: decoded.iss,
    aud: decoded.aud,
    sub: decoded.sub,
  });
  const address = computeZkLoginAddress({
    claimName: "sub",
    claimValue: decoded.sub,
    iss: decoded.iss,
    aud: decoded.aud,
    userSalt,
    legacyAddress: false,
  });
  const subHash = await sha256Hex(decoded.sub);
  const expiresAt =
    typeof decoded.exp === "number" && Number.isFinite(decoded.exp)
      ? new Date(decoded.exp * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return {
    iss: decoded.iss,
    aud: decoded.aud,
    address,
    subHash,
    expiresAt,
  } satisfies DerivedZkLoginIdentity;
}
