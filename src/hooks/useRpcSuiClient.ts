import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { useMemo } from "react";
import { createBrowserSafeSuiTransport } from "../lib/suiRpcTransport";
import { SUI_NETWORK } from "../lib/sui";
import { useRpcInfrastructure } from "../rpcInfrastructure";

export function useRpcSuiClient() {
  const rpc = useRpcInfrastructure();

  return useMemo(
    () =>
      new SuiJsonRpcClient({
        network: SUI_NETWORK,
        transport: createBrowserSafeSuiTransport(rpc.currentRpcUrl),
      }),
    [rpc.currentRpcUrl],
  );
}
