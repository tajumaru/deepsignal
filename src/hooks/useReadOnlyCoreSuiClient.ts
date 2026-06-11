import type { ClientWithCoreApi } from "@mysten/sui/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { useMemo } from "react";
import { createBrowserSafeSuiTransport } from "../lib/suiRpcTransport";
import { getPreferredGrpcUrl, SUI_NETWORK } from "../lib/sui";
import { useRpcInfrastructure } from "../rpcInfrastructure";

export function useReadOnlyCoreSuiClient(): ClientWithCoreApi {
  const rpc = useRpcInfrastructure();
  const grpcUrl = getPreferredGrpcUrl(rpc.currentRpcUrl);

  return useMemo(() => {
    if (grpcUrl) {
      return new SuiGrpcClient({
        network: SUI_NETWORK,
        baseUrl: grpcUrl,
      });
    }

    return new SuiJsonRpcClient({
      network: SUI_NETWORK,
      transport: createBrowserSafeSuiTransport(rpc.currentRpcUrl),
    });
  }, [grpcUrl, rpc.currentRpcUrl]);
}
