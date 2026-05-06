import type { SealAdapter } from "../types";
import { parseRealSealEnvelope, REAL_SEAL_MODE_REQUIRED_MESSAGE } from "./sealPayload";

function encodeUtf8(value: string) {
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeUtf8(value: string) {
  return decodeURIComponent(escape(atob(value)));
}

export const localSealMock: SealAdapter = {
  async encrypt(value) {
    return `seal:${encodeUtf8(value)}`;
  },
  async decrypt(value) {
    if (parseRealSealEnvelope(value)) {
      throw new Error(REAL_SEAL_MODE_REQUIRED_MESSAGE);
    }
    if (!value.startsWith("seal:")) {
      return value;
    }
    return decodeUtf8(value.slice(5));
  },
};
