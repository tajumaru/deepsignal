import type { usePublicNftGate, PublicNftAccessCheckResult } from "../hooks/usePublicNftGate";

export interface PublicNftGateRuntimeState {
  nftGate: ReturnType<typeof usePublicNftGate>["nftGate"];
  nftRequired: boolean;
  viewGateActive: boolean;
  submitGateActive: boolean;
  isChecking: boolean;
  ownedCount: number;
  meetsRequirement: boolean;
  canViewForm: boolean;
  hasResolvedOwnership: boolean;
  debugInfo?: ReturnType<typeof usePublicNftGate>["debugInfo"];
  gateError: string;
  recheckAccess?: () => Promise<PublicNftAccessCheckResult>;
}

export function createDefaultPublicNftGateRuntimeState(): PublicNftGateRuntimeState {
  return {
    nftGate: undefined,
    nftRequired: false,
    viewGateActive: false,
    submitGateActive: false,
    isChecking: false,
    ownedCount: 0,
    meetsRequirement: false,
    canViewForm: true,
    hasResolvedOwnership: false,
    debugInfo: undefined,
    gateError: "",
    recheckAccess: undefined,
  };
}
