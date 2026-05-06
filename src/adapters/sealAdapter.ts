import type { SealAdapter } from "../types";

export const sealAdapter: SealAdapter = {
  async encrypt(value) {
    // TODO: Replace with real Seal client SDK encryption once available.
    // The final version should handle key management and per-tenant policies.
    return value;
  },
  async decrypt(value) {
    // TODO: Replace with real Seal client SDK decryption once available.
    return value;
  },
};
