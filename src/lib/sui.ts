export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const SUI_NETWORK = import.meta.env.VITE_SUI_NETWORK || "testnet";
export const WALFORM_PACKAGE_ID = import.meta.env.VITE_WALFORM_PACKAGE_ID || "";
