import { useSuiClient } from "../lib/mystenDappKitCompat";

export function useRpcSuiClient() {
  const suiClient = useSuiClient();
  return suiClient;
}
