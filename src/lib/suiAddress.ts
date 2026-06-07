const SUI_ADDRESS_HEX_LENGTH = 64;

function normalizeHexAddress(value: string) {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  if (!hex || hex.length > SUI_ADDRESS_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  return `0x${hex.toLowerCase().padStart(SUI_ADDRESS_HEX_LENGTH, "0")}`;
}

export function getSuiAddressValidationState(value: unknown): "empty" | "valid" | "invalid" {
  const address = typeof value === "string" ? value.trim() : "";
  if (!address) {
    return "empty";
  }
  return normalizeHexAddress(address) ? "valid" : "invalid";
}

export function isValidSuiAddress(value: unknown) {
  return getSuiAddressValidationState(value) === "valid";
}

export function normalizeValidSuiAddress(value: unknown) {
  const address = typeof value === "string" ? value.trim() : "";
  const normalizedAddress = normalizeHexAddress(address);
  if (!address || !normalizedAddress) {
    return address;
  }
  return normalizedAddress;
}

export function normalizeSuiAddress(value: unknown) {
  return normalizeValidSuiAddress(value);
}
