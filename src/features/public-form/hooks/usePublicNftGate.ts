import { useCallback, useEffect, useMemo, useState } from "react";
import { useRpcInfrastructure } from "../../../rpcInfrastructure";
import {
  getCurrentFormNftNetwork,
  isNftGatedForm,
  normalizeFormNftGate,
  resolveFormAccessMode,
} from "../../../lib/formAccess";
import type { FormSchema, FormNftGate } from "../../../types";

export interface PublicNftAccessCheckResult {
  checkedAt: string;
  passed: boolean;
  reason?: "not_required" | "wallet_missing" | "network_mismatch" | "ownership_missing" | "rpc_failed";
  walletAddress?: string;
  structType?: string;
  requiredCount?: number;
  ownedCount: number;
  network?: FormNftGate["network"];
  gateViewing?: boolean;
  gateSubmission?: boolean;
}

function buildAccessCheckResult(
  nftGate: FormNftGate | undefined,
  walletAddress: string | undefined,
  ownedCount: number,
  passed: boolean,
  reason?: PublicNftAccessCheckResult["reason"],
): PublicNftAccessCheckResult {
  return {
    checkedAt: new Date().toISOString(),
    passed,
    reason,
    walletAddress,
    structType: nftGate?.structType,
    requiredCount: nftGate?.requiredCount,
    ownedCount,
    network: nftGate?.network,
    gateViewing: nftGate?.gateViewing,
    gateSubmission: nftGate?.gateSubmission,
  };
}

export function usePublicNftGate(form: FormSchema | null, walletAddress?: string) {
  const rpc = useRpcInfrastructure();
  const accessMode = form ? resolveFormAccessMode(form) : "public";
  const nftGate = useMemo(
    () => normalizeFormNftGate(form?.nftGate, accessMode) ?? undefined,
    [accessMode, form?.nftGate],
  );
  const nftRequired = Boolean(form && isNftGatedForm(form) && nftGate);
  const networkMatches = !nftGate || nftGate.network === getCurrentFormNftNetwork();
  const [ownedCount, setOwnedCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [gateError, setGateError] = useState("");

  const checkOwnership = useCallback(async () => {
    if (!nftRequired || !walletAddress || !nftGate?.structType || !networkMatches) {
      setOwnedCount(0);
      setIsChecking(false);
      return 0;
    }
    setIsChecking(true);
    try {
      const { fetchOwnedSuiObjectsForClient } = await import("../../../hooks/useOwnedSuiObjects");
      const client = {
        async getOwnedObjects(request: unknown) {
          const ownedObjectsRequest = request as {
            owner: string;
            filter?: unknown;
            options?: unknown;
            cursor?: string | null;
            limit?: number | null;
          };
          const response = await fetch(rpc.currentRpcUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "public-nft-gate",
              method: "suix_getOwnedObjects",
              params: [
                ownedObjectsRequest.owner,
                ownedObjectsRequest.filter ?? null,
                ownedObjectsRequest.options ?? null,
                ownedObjectsRequest.cursor ?? null,
                ownedObjectsRequest.limit ?? null,
              ],
            }),
          });
          if (!response.ok) {
            throw new Error(`Sui RPC request failed with status ${response.status}.`);
          }
          const payload = await response.json();
          if (payload?.error) {
            throw new Error(payload.error.message || "Sui RPC request failed.");
          }
          return payload?.result;
        },
      };
      const ownedObjects = await fetchOwnedSuiObjectsForClient(client, walletAddress, [nftGate.structType]);
      setOwnedCount(ownedObjects.length);
      setGateError("");
      return ownedObjects.length;
    } catch (error) {
      setGateError(error instanceof Error ? error.message : "NFT ownership could not be verified.");
      setOwnedCount(0);
      throw error;
    } finally {
      setIsChecking(false);
    }
  }, [networkMatches, nftGate?.structType, nftRequired, rpc.currentRpcUrl, walletAddress]);

  useEffect(() => {
    if (!nftRequired || !walletAddress || !nftGate?.structType || !networkMatches) {
      return;
    }
    void checkOwnership().catch(() => undefined);
  }, [checkOwnership, networkMatches, nftGate?.structType, nftRequired, walletAddress]);

  const meetsRequirement = Boolean(
    nftGate &&
      walletAddress &&
      networkMatches &&
      ownedCount >= Math.max(1, nftGate.requiredCount || 1),
  );
  const canViewForm = !nftRequired || meetsRequirement;
  const viewGateActive = Boolean(nftRequired && nftGate?.gateViewing !== false);
  const submitGateActive = Boolean(nftRequired && nftGate?.gateSubmission !== false);

  const recheckAccess = useCallback(async (): Promise<PublicNftAccessCheckResult> => {
    if (!nftRequired) {
      return buildAccessCheckResult(nftGate, walletAddress, 0, true, "not_required");
    }
    if (!walletAddress) {
      return buildAccessCheckResult(nftGate, walletAddress, 0, false, "wallet_missing");
    }
    if (!networkMatches) {
      return buildAccessCheckResult(nftGate, walletAddress, ownedCount, false, "network_mismatch");
    }
    try {
      const nextOwnedCount = await checkOwnership();
      const passed = nextOwnedCount >= Math.max(1, nftGate?.requiredCount || 1);
      return buildAccessCheckResult(
        nftGate,
        walletAddress,
        nextOwnedCount,
        passed,
        passed ? undefined : "ownership_missing",
      );
    } catch {
      return buildAccessCheckResult(nftGate, walletAddress, ownedCount, false, "rpc_failed");
    }
  }, [checkOwnership, networkMatches, nftGate, nftRequired, ownedCount, walletAddress]);

  return {
    accessMode,
    nftGate,
    nftRequired,
    viewGateActive,
    submitGateActive,
    isChecking,
    ownedCount,
    meetsRequirement,
    canViewForm,
    gateError: !networkMatches ? "This NFT-gated signal is configured for a different Sui network." : gateError,
    recheckAccess,
  };
}
