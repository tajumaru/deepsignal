import type { ClientWithCoreApi } from "@mysten/sui/client";
import { useReadOnlyCoreSuiClient } from "./useReadOnlyCoreSuiClient";

export function useReadOnlySuiClient(): ClientWithCoreApi {
  return useReadOnlyCoreSuiClient();
}
