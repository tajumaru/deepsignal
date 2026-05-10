import {
  NoAccessError,
  SealClient,
  SessionKey,
  type KeyServerConfig,
  type SealCompatibleClient,
} from "@mysten/seal";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import type { SealAdapter } from "../types";
import { SUI_NETWORK } from "../lib/sui";
import { localSealMock } from "./localSealMock";
import {
  createProjectScopedSealId,
  createRealSealEnvelope,
  doesSealIdMatchProject,
  fromBase64,
  isLikelyWalletCancelError,
  parseRealSealEnvelope,
  REAL_SEAL_SESSION_TTL_MIN,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE,
  SEAL_SUI_CLIENT_REQUIRED_MESSAGE,
  SEAL_WALLET_CANCELLED_MESSAGE,
  toBase64,
} from "./sealPayload";

const requestedNetwork = SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";
const sealServerType =
  import.meta.env.VITE_SEAL_SERVER_TYPE === "committee" ? "committee" : "independent";

const serverConfig: KeyServerConfig = {
  objectId: import.meta.env.VITE_SEAL_KEY_SERVER_OBJECT_ID ?? "",
  weight: 1,
  ...(sealServerType === "committee" && import.meta.env.VITE_SEAL_AGGREGATOR_URL
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
  async encrypt(value, context) {
    const projectId = context?.projectId?.trim() || undefined;
    const objectId = projectId ? createProjectScopedSealId(projectId) : createRandomObjectId();
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
        projectId,
        approvalPolicy: projectId ? "project_signal_v1" : undefined,
      }),
    );
  },

  async decrypt(value, context) {
    if (value.startsWith("seal:")) {
      return localSealMock.decrypt(value, context);
    }

    const envelope = parseRealSealEnvelope(value);
    if (!envelope) {
      return value;
    }

    if (!context?.walletAddress || !context.signPersonalMessage) {
      throw new Error(SEAL_ADMIN_WALLET_REQUIRED_MESSAGE);
    }
    if (!context.suiClient) {
      throw new Error(SEAL_SUI_CLIENT_REQUIRED_MESSAGE);
    }

    const projectId = envelope.projectId ?? context.projectId?.trim();
    if (!projectId) {
      throw new Error(SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE);
    }

    try {
      const sessionKey = await SessionKey.create({
        address: context.walletAddress,
        packageId: envelope.packageId,
        ttlMin: REAL_SEAL_SESSION_TTL_MIN,
        suiClient: context.suiClient as SealCompatibleClient,
      });
      const signature = await context.signPersonalMessage(sessionKey.getPersonalMessage());
      await sessionKey.setPersonalMessageSignature(signature);

      const txBytes = await buildSealApproveTransactionBytes({
        objectId: envelope.objectId,
        projectId,
        approvalPolicy:
          envelope.approvalPolicy ??
          (doesSealIdMatchProject(envelope.objectId, projectId)
            ? "project_signal_v1"
            : "project_admin_v0"),
        suiClient: context.suiClient as SealCompatibleClient,
        packageId: envelope.packageId,
      });

      const plaintext = await sealClient.decrypt({
        data: fromBase64(envelope.encryptedObject),
        sessionKey,
        txBytes,
      });

      return new TextDecoder().decode(plaintext);
    } catch (error) {
      if (isLikelyWalletCancelError(error)) {
        throw new Error(SEAL_WALLET_CANCELLED_MESSAGE);
      }
      if (error instanceof NoAccessError) {
        throw new Error(SEAL_PERMISSION_DENIED_MESSAGE);
      }
      if (error instanceof Error && error.message === SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE) {
        throw error;
      }
      throw error instanceof Error ? error : new Error(SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE);
    }
  },
};

async function buildSealApproveTransactionBytes({
  objectId,
  projectId,
  approvalPolicy,
  suiClient: activeSuiClient,
  packageId,
}: {
  objectId: string;
  projectId: string;
  approvalPolicy: "project_signal_v1" | "project_admin_v0";
  suiClient: SealCompatibleClient;
  packageId: string;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::project_registry::${
      approvalPolicy === "project_signal_v1"
        ? "seal_approve_project_signal"
        : "seal_approve_project_admin"
    }`,
    arguments: [tx.pure.vector("u8", fromHex(objectId)), tx.object(projectId)],
  });
  return tx.build({
    client: activeSuiClient,
    onlyTransactionKind: true,
  });
}
