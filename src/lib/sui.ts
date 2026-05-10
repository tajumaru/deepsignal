export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const requestedNetwork = String(
  import.meta.env.VITE_WALRUS_NETWORK ||
    import.meta.env.VITE_SUI_NETWORK ||
    "testnet",
).toLowerCase();
export const SUI_NETWORK = requestedNetwork === "mainnet" ? "mainnet" : "testnet";
export const SUI_FULLNODE_URL =
  import.meta.env.VITE_SUI_FULLNODE_URL ||
  import.meta.env.VITE_RPC_URL ||
  "";
export const SUI_RPC_URL = SUI_FULLNODE_URL;
export const WALRUS_AGGREGATOR_URL =
  import.meta.env.VITE_WALRUS_AGGREGATOR_URL ||
  (SUI_NETWORK === "mainnet"
    ? "https://aggregator.walrus-mainnet.walrus.space"
    : "https://aggregator.walrus-testnet.walrus.space");
export const WALRUS_UPLOAD_RELAY_URL =
  import.meta.env.VITE_WALRUS_UPLOAD_RELAY_URL ||
  (SUI_NETWORK === "mainnet"
    ? "https://upload-relay.mainnet.walrus.space"
    : "https://upload-relay.testnet.walrus.space");
export const WALFORM_PACKAGE_ID = import.meta.env.VITE_WALFORM_PACKAGE_ID || "";
export const ACCESS_CONTROL_PACKAGE_ID =
  import.meta.env.VITE_PACKAGE_ID ||
  import.meta.env.VITE_DEEPSIGNAL_PACKAGE_ID ||
  "";
export const ACCESS_CONTROL_REGISTRY_ID =
  import.meta.env.VITE_REGISTRY_ID ||
  import.meta.env.VITE_DEEPSIGNAL_REGISTRY_ID ||
  "";
export const ACCESS_CONTROL_ADMIN_CAP_ID =
  import.meta.env.VITE_ADMIN_CAP_ID ||
  import.meta.env.VITE_DEEPSIGNAL_ADMIN_CAP_ID ||
  "";
export const ACCESS_CONTROL_OWNER_CAP_ID =
  import.meta.env.VITE_OWNER_CAP_ID ||
  import.meta.env.VITE_DEEPSIGNAL_OWNER_CAP_ID ||
  "";
export const ACCESS_CONTROL_MODULE = "access_control";
export const PROJECT_REGISTRY_MODULE = "project_registry";
export const ACCESS_CONTROL_OWNER_CAP_TYPE = ACCESS_CONTROL_PACKAGE_ID
  ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::OwnerCap`
  : "";
export const ACCESS_CONTROL_ADMIN_CAP_TYPE = ACCESS_CONTROL_PACKAGE_ID
  ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::AdminCap`
  : "";
export const ACCESS_CONTROL_REVIEWER_CAP_TYPE = ACCESS_CONTROL_PACKAGE_ID
  ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::ReviewerCap`
  : "";
export const PROJECT_OWNER_CAP_TYPE = ACCESS_CONTROL_PACKAGE_ID
  ? `${ACCESS_CONTROL_PACKAGE_ID}::${PROJECT_REGISTRY_MODULE}::ProjectOwnerCap`
  : "";
