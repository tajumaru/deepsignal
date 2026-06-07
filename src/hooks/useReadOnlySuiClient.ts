import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { useMemo } from "react";
import { createBrowserSafeSuiTransport } from "../lib/suiRpcTransport";
import { useRpcInfrastructure } from "../rpcInfrastructure";
import { SUI_NETWORK } from "../lib/sui";

export function useReadOnlySuiClient() {
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
