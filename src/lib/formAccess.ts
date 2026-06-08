import { SUI_NETWORK } from "./sui";
import type { FormAccessMode, FormIdentityPolicy, FormNftGate, FormSchema } from "../types";

export const PRIME_MACHIN_PRESET_ID = "prime_machin" as const;
export const TALLY_PRESET_ID = "tally" as const;
export const CUSTOM_NFT_PRESET_ID = "custom" as const;
export const PRIME_MACHIN_COLLECTION_LABEL = "Prime Machin";
export const TALLY_COLLECTION_LABEL = "Tally";
export const PRIME_MACHIN_STRUCT_TYPE =
  "0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachin";
export const TALLY_STRUCT_TYPE =
  "0x75888defd3f392d276643932ae204cd85337a5b8f04335f9f912b6291149f423::nft::Tally";

export function getCurrentFormNftNetwork(): FormNftGate["network"] {
  return SUI_NETWORK === "mainnet" ? "sui-mainnet" : "sui-testnet";
}

export function inferAccessModeFromIdentityPolicy(identityPolicy: unknown): FormAccessMode {
  return identityPolicy === "wallet_required" ? "wallet_required" : "public";
}

export function normalizeFormAccessMode(accessMode: unknown, identityPolicy?: unknown): FormAccessMode {
  if (accessMode === "wallet_required" || accessMode === "nft_required" || accessMode === "public") {
    return accessMode;
  }
  return inferAccessModeFromIdentityPolicy(identityPolicy);
}

export function getIdentityPolicyForAccessMode(accessMode: FormAccessMode): FormIdentityPolicy {
  return accessMode === "public" ? "anonymous_allowed" : "wallet_required";
}

export function normalizeFormIdentityPolicyWithAccess(accessMode: FormAccessMode, identityPolicy: unknown): FormIdentityPolicy {
  if (accessMode === "nft_required") {
    return "wallet_required";
  }
  return identityPolicy === "wallet_required" ? "wallet_required" : "anonymous_allowed";
}

export function normalizeFormNftGate(
  raw: unknown,
  accessMode: FormAccessMode,
): FormNftGate | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const gate = raw as Partial<FormNftGate>;
  const requiredCount =
    typeof gate.requiredCount === "number"
      ? Math.max(1, Math.floor(gate.requiredCount))
      : typeof gate.requiredCount === "string"
        ? Math.max(1, Math.floor(Number(gate.requiredCount) || 1))
        : 1;
  const normalized: FormNftGate = {
    network: gate.network === "sui-mainnet" || gate.network === "sui-testnet" ? gate.network : getCurrentFormNftNetwork(),
    structType: typeof gate.structType === "string" ? gate.structType.trim() : "",
    objectId: typeof gate.objectId === "string" ? gate.objectId.trim() || undefined : undefined,
    requiredCount,
    gateViewing: gate.gateViewing !== false,
    gateSubmission: gate.gateSubmission !== false,
    collectionLabel: typeof gate.collectionLabel === "string" ? gate.collectionLabel.trim() || undefined : undefined,
    presetId:
      gate.presetId === PRIME_MACHIN_PRESET_ID || gate.presetId === TALLY_PRESET_ID || gate.presetId === CUSTOM_NFT_PRESET_ID
        ? gate.presetId
        : undefined,
    futureSealPolicy:
      gate.futureSealPolicy &&
      typeof gate.futureSealPolicy === "object" &&
      (gate.futureSealPolicy.policyMode === "none" || gate.futureSealPolicy.policyMode === "nft_ownership_decrypt")
        ? {
            eligible: gate.futureSealPolicy.eligible !== false,
            policyMode: gate.futureSealPolicy.policyMode,
          }
        : undefined,
  };
  if (accessMode !== "nft_required" && !normalized.structType && !normalized.objectId) {
    return undefined;
  }
  return normalized;
}

export function isNftRequiredAccessMode(accessMode: FormAccessMode | undefined) {
  return accessMode === "nft_required";
}

export function resolveFormAccessMode(form: Pick<FormSchema, "accessMode" | "identityPolicy"> | null | undefined): FormAccessMode {
  return normalizeFormAccessMode(form?.accessMode, form?.identityPolicy);
}

export function isNftGatedForm(form: Pick<FormSchema, "accessMode" | "identityPolicy"> | null | undefined) {
  return resolveFormAccessMode(form) === "nft_required";
}

export function requiresWalletForFormAccess(form: Pick<FormSchema, "accessMode" | "identityPolicy"> | null | undefined) {
  const accessMode = resolveFormAccessMode(form);
  return accessMode === "wallet_required" || accessMode === "nft_required";
}

export function createDefaultNftGate(presetId: FormNftGate["presetId"] = CUSTOM_NFT_PRESET_ID): FormNftGate {
  if (presetId === PRIME_MACHIN_PRESET_ID) {
    return {
      network: getCurrentFormNftNetwork(),
      structType: PRIME_MACHIN_STRUCT_TYPE,
      objectId: undefined,
      requiredCount: 1,
      gateViewing: true,
      gateSubmission: true,
      collectionLabel: PRIME_MACHIN_COLLECTION_LABEL,
      presetId,
      futureSealPolicy: {
        eligible: true,
        policyMode: "none",
      },
    };
  }
  if (presetId === TALLY_PRESET_ID) {
    return {
      network: getCurrentFormNftNetwork(),
      structType: TALLY_STRUCT_TYPE,
      objectId: undefined,
      requiredCount: 1,
      gateViewing: true,
      gateSubmission: true,
      collectionLabel: TALLY_COLLECTION_LABEL,
      presetId,
      futureSealPolicy: {
        eligible: true,
        policyMode: "none",
      },
    };
  }
  return {
    network: getCurrentFormNftNetwork(),
    structType: "",
    objectId: undefined,
    requiredCount: 1,
    gateViewing: true,
    gateSubmission: true,
    collectionLabel: undefined,
    presetId,
    futureSealPolicy: {
      eligible: true,
      policyMode: "none",
    },
  };
}

export function getNftGatePresetLabel(presetId?: FormNftGate["presetId"]) {
  if (presetId === PRIME_MACHIN_PRESET_ID) {
    return PRIME_MACHIN_COLLECTION_LABEL;
  }
  if (presetId === TALLY_PRESET_ID) {
    return TALLY_COLLECTION_LABEL;
  }
  return "Custom Struct Type";
}
