export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const requestedNetwork = String(
  import.meta.env.VITE_WALRUS_NETWORK ||
    import.meta.env.VITE_SUI_NETWORK ||
    "mainnet",
).toLowerCase();
export const SUI_NETWORK = requestedNetwork === "mainnet" ? "mainnet" : "testnet";
export const SUI_DEFAULT_RPC_URL =
  SUI_NETWORK === "mainnet"
    ? "https://fullnode.mainnet.sui.io:443"
    : "https://fullnode.testnet.sui.io:443";
export const SUI_TATUM_RPC_URL = import.meta.env.NEXT_PUBLIC_SUI_RPC_URL || "";
export const SUI_FALLBACK_RPC_URL =
  import.meta.env.VITE_SUI_FULLNODE_URL ||
  import.meta.env.VITE_RPC_URL ||
  SUI_DEFAULT_RPC_URL;
export const SUI_FULLNODE_URL = SUI_TATUM_RPC_URL || SUI_FALLBACK_RPC_URL;
export const SUI_RPC_URL = SUI_FULLNODE_URL || SUI_DEFAULT_RPC_URL;
export const TATUM_ENABLED = String(import.meta.env.NEXT_PUBLIC_TATUM_ENABLED || "").toLowerCase() === "true";
export const TATUM_PROXY_ENABLED = import.meta.env.VITE_TATUM_PROXY_ENABLED === "true";
export const TATUM_PROXY_PATH = import.meta.env.VITE_TATUM_PROXY_PATH || "/api/tatum/sui-rpc";

export function isTatumRpcUrl(url?: string | null) {
  return Boolean(url && url.toLowerCase().includes("gateway.tatum.io"));
}

export function getRpcProviderLabel(url?: string | null) {
  return isTatumRpcUrl(url) ? "Tatum RPC" : "Sui Fullnode";
}

export function getEffectiveTatumRpcUrl() {
  if (!TATUM_ENABLED || !isTatumRpcUrl(SUI_TATUM_RPC_URL)) {
    return null;
  }
  return TATUM_PROXY_ENABLED ? TATUM_PROXY_PATH : SUI_TATUM_RPC_URL;
}

export function getConnectedNetworkLabel(chainIdentifier?: string | null) {
  const normalized = String(chainIdentifier || "").toLowerCase();
  if (normalized.includes("mainnet")) {
    return "mainnet";
  }
  if (normalized.includes("testnet")) {
    return "testnet";
  }
  return SUI_NETWORK;
}

export function isSuiRateLimitError(error: unknown) {
  if (!error) {
    return false;
  }

  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (status === 429) {
    return true;
  }

  const cause = typeof error === "object" && error !== null && "cause" in error
    ? (error as { cause?: unknown }).cause
    : undefined;
  if (cause && cause !== error && isSuiRateLimitError(cause)) {
    return true;
  }

  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`.toLowerCase()
      : String(error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("status code: 429")
  );
}
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
