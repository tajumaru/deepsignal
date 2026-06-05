import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { useMemo } from "react";
import { useRpcInfrastructure } from "../rpcInfrastructure";

export function useRpcSuiClient() {
  const rpc = useRpcInfrastructure();

  return useMemo(
    () =>
      new SuiJsonRpcClient({
        network: rpc.network,
        transport: new JsonRpcHTTPTransport({
          url: rpc.currentRpcUrl,
        }),
      }),
    [rpc.currentRpcUrl, rpc.network],
  );
}
