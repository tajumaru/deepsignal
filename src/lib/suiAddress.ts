import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

export function getSuiAddressValidationState(value: unknown): "empty" | "valid" | "invalid" {
  const address = typeof value === "string" ? value.trim() : "";
  if (!address) {
    return "empty";
  }
  return isValidSuiAddress(address) ? "valid" : "invalid";
}

export function normalizeValidSuiAddress(value: unknown) {
  const address = typeof value === "string" ? value.trim() : "";
  if (!address || !isValidSuiAddress(address)) {
    return address;
  }
  return normalizeSuiAddress(address);
}
