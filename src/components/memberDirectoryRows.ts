import type { useAccessRegistry } from "../hooks/useAccessRegistry";

export function buildRegistryRows(registry: ReturnType<typeof useAccessRegistry>["registry"]) {
  return [
    ...(registry.owner ? [registry.owner] : []),
    ...registry.admins,
  ].map((entry) => ({
    ...entry,
    key: `${entry.role}:${entry.address}:${entry.capId}`,
  }));
}
