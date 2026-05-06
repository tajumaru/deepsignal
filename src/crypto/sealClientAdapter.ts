import { SealClient, type KeyServerConfig } from "@mysten/seal";
import type { SealCompatibleClient } from "@mysten/seal";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import type { SealAdapter } from "../types";
import { SUI_NETWORK } from "../lib/sui";
import { localSealMock } from "./localSealMock";
import {
  createRealSealEnvelope,
  parseRealSealEnvelope,
  SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE,
  toBase64,
} from "./sealPayload";

const requestedNetwork = SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";

const serverConfig: KeyServerConfig = {
  objectId: import.meta.env.VITE_SEAL_KEY_SERVER_OBJECT_ID ?? "",
  weight: 1,
  ...(import.meta.env.VITE_SEAL_AGGREGATOR_URL
    ? { aggregatorUrl: import.meta.env.VITE_SEAL_AGGREGATOR_URL }
    : {}),
};

const suiClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl(requestedNetwork),
  network: requestedNetwork,
});

const sealClient = new SealClient({
  suiClient: suiClient as unknown as SealCompatibleClient,
  serverConfigs: [serverConfig],
});

function createRandomObjectId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export const sealClientAdapter: SealAdapter = {
  async encrypt(value) {
    const objectId = createRandomObjectId();
    const data = new TextEncoder().encode(value);
    const { encryptedObject } = await sealClient.encrypt({
      threshold: 1,
      packageId: import.meta.env.VITE_SEAL_PACKAGE_ID ?? "",
      id: objectId,
      data,
    });

    return JSON.stringify(
      createRealSealEnvelope({
        packageId: import.meta.env.VITE_SEAL_PACKAGE_ID ?? "",
        objectId,
        threshold: 1,
        serverObjectIds: [serverConfig.objectId],
        encryptedObject: toBase64(encryptedObject),
      }),
    );
  },

  async decrypt(value) {
    if (value.startsWith("seal:")) {
      return localSealMock.decrypt(value);
    }

    if (parseRealSealEnvelope(value)) {
      throw new Error(SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE);
    }

    return value;
  },
};
