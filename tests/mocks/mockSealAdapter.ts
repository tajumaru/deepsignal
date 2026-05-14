import type { SealAdapter } from "../../src/types";

function encodeUtf8(value: string) {
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeUtf8(value: string) {
  return decodeURIComponent(escape(atob(value)));
}

export const mockSealAdapter: SealAdapter = {
  async encrypt(value) {
    return `mock-seal:${encodeUtf8(value)}`;
  },
  async decrypt(value) {
    if (!value.startsWith("mock-seal:")) {
      throw new Error("Mock Seal payload expected.");
    }
    return decodeUtf8(value.slice("mock-seal:".length));
  },
};
