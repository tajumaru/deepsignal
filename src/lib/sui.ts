export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const requestedNetwork = String(import.meta.env.VITE_SUI_NETWORK || "testnet").toLowerCase();
export const SUI_NETWORK = requestedNetwork === "mainnet" ? "mainnet" : "testnet";
export const SUI_RPC_URL = import.meta.env.VITE_RPC_URL || "";
export const WALFORM_PACKAGE_ID = import.meta.env.VITE_WALFORM_PACKAGE_ID || "";
export const ACCESS_CONTROL_PACKAGE_ID =
  import.meta.env.VITE_PACKAGE_ID ||
  import.meta.env.VITE_DEEPSIGNAL_PACKAGE_ID ||
  "";
export const ACCESS_CONTROL_REGISTRY_ID =
  import.meta.env.VITE_REGISTRY_ID ||
  import.meta.env.VITE_DEEPSIGNAL_REGISTRY_ID ||
  "";
export const ACCESS_CONTROL_MODULE = "access_control";
export const ACCESS_CONTROL_OWNER_CAP_TYPE = ACCESS_CONTROL_PACKAGE_ID
  ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::OwnerCap`
  : "";
export const ACCESS_CONTROL_ADMIN_CAP_TYPE = ACCESS_CONTROL_PACKAGE_ID
  ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::AdminCap`
  : "";
export const ACCESS_CONTROL_REVIEWER_CAP_TYPE = ACCESS_CONTROL_PACKAGE_ID
  ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::ReviewerCap`
  : "";
