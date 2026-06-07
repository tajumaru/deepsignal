import { SUI_NETWORK } from "./sui";
import type { WalrusNetwork } from "../types";

export function getWalrusNetwork(network?: string | null): WalrusNetwork {
  return network === "mainnet" ? "mainnet" : "testnet";
}

export function getCurrentWalrusNetwork(): WalrusNetwork {
  return getWalrusNetwork(SUI_NETWORK);
}
