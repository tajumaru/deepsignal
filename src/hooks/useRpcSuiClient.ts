import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { useMemo } from "react";
import { createBrowserSafeSuiTransport } from "../lib/suiRpcTransport";
import { useRpcInfrastructure } from "../rpcInfrastructure";

export function useRpcSuiClient(overrideRpcUrl?: string) {
  const rpc = useRpcInfrastructure();
  const rpcUrl = overrideRpcUrl || rpc.currentRpcUrl;

  return useMemo(
    () =>
      new SuiJsonRpcClient({
        network: rpc.network,
        transport: createBrowserSafeSuiTransport(rpcUrl),
      }),
    [rpc.network, rpcUrl],
  );
}
