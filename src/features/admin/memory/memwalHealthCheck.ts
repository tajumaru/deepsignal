import { noopMemoryAdapter, validateMemWalConfig, type MemoryRuntimeStatus } from "../../../memory";

export type AdminMemWalHealthCheck = {
  scope: "admin";
  status: "disabled" | "misconfigured";
  runtime: MemoryRuntimeStatus;
  checkedAt: string;
  missing: string[];
  errors: string[];
};

export async function runAdminMemWalHealthCheck(): Promise<AdminMemWalHealthCheck> {
  const validation = validateMemWalConfig();
  const runtime = noopMemoryAdapter.getRuntimeStatus();

  return {
    scope: "admin",
    status: validation.enabled && !validation.configured ? "misconfigured" : "disabled",
    runtime,
    checkedAt: new Date().toISOString(),
    missing: validation.missing,
    errors: validation.errors,
  };
}
