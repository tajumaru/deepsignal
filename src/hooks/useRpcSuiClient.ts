import { useSuiClient } from "@mysten/dapp-kit";

export function useRpcSuiClient() {
  const suiClient = useSuiClient();
  return suiClient;
}
