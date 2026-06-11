import { useEffect } from "react";
import { usePublicNftGate } from "../hooks/usePublicNftGate";
import type { PublicNftGateRuntimeState } from "./PublicNftGateRuntimeState";
import type { FormSchema } from "../../../types";

export function PublicNftGateRuntime({
  form,
  walletAddress,
  onStateChange,
}: {
  form: FormSchema | null;
  walletAddress?: string;
  onStateChange: (state: PublicNftGateRuntimeState) => void;
}) {
  const nftGate = usePublicNftGate(form, walletAddress);

  useEffect(() => {
    onStateChange({
      nftGate: nftGate.nftGate,
      nftRequired: nftGate.nftRequired,
      viewGateActive: nftGate.viewGateActive,
      submitGateActive: nftGate.submitGateActive,
      isChecking: nftGate.isChecking,
      checkingPhase: nftGate.checkingPhase,
      ownedCount: nftGate.ownedCount,
      meetsRequirement: nftGate.meetsRequirement,
      canViewForm: nftGate.canViewForm,
      hasResolvedOwnership: nftGate.hasResolvedOwnership,
      debugInfo: nftGate.debugInfo,
      gateError: nftGate.gateError,
      recheckAccess: nftGate.recheckAccess,
    });
  }, [
    nftGate.canViewForm,
    nftGate.debugInfo,
    nftGate.gateError,
    nftGate.hasResolvedOwnership,
    nftGate.isChecking,
    nftGate.checkingPhase,
    nftGate.meetsRequirement,
    nftGate.nftGate,
    nftGate.nftRequired,
    nftGate.ownedCount,
    nftGate.recheckAccess,
    nftGate.submitGateActive,
    nftGate.viewGateActive,
    onStateChange,
  ]);

  return null;
}
