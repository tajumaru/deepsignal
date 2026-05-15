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
import type { SealAdapter, SealDecryptContext } from "../types";
import { ACCESS_CONTROL_REGISTRY_ID, SUI_NETWORK } from "../lib/sui";
import { serializeDecryptError } from "./decryptDiagnostics";
import {
  createOwnerScopedSealId,
  createProjectScopedSealId,
  createRealSealEnvelope,
  doesSealIdMatchOwner,
  doesSealIdMatchProject,
  fromBase64,
  isLikelyWalletCancelError,
  parseRealSealEnvelope,
  REAL_SEAL_SESSION_TTL_MIN,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE,
  SEAL_NOT_CONFIGURED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE,
  SEAL_RUNTIME_UNAVAILABLE_MESSAGE,
  SEAL_SESSION_EXPIRED_MESSAGE,
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

const SESSION_KEY_STORAGE_PREFIX = "deepsignal.seal.sessionKey";
const sessionKeyCache = new Map<string, SessionKey>();
const pendingSessionKeyPromises = new Map<string, Promise<SessionKey>>();

function debugSealClientError(event: string, details: Record<string, unknown>, error: unknown) {
  console.debug("[seal-client]", event, {
    ...details,
    error: serializeDecryptError(error),
  });
}

function createErrorWithCause(message: string, cause: unknown) {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
}

function debugSessionKeyCache(
  event: "cache_hit" | "cache_miss" | "cache_expired" | "import_failed" | "pending_reuse" | "persist_failed",
  details: Record<string, unknown>,
) {
  if (!import.meta.env.DEV) {
    return;
  }
  console.debug("[seal-session-key]", event, details);
}

function createRandomObjectId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export const sealClientAdapter: SealAdapter = {
  async encrypt(value, context) {
    if (!import.meta.env.VITE_SEAL_PACKAGE_ID || !serverConfig.objectId) {
      throw new Error(SEAL_NOT_CONFIGURED_MESSAGE);
    }
    const projectId = context?.projectId?.trim() || undefined;
    const ownerAddress = context?.ownerAddress?.trim() || undefined;
    const objectId = projectId
      ? createProjectScopedSealId(projectId)
      : ownerAddress
        ? createOwnerScopedSealId(ownerAddress)
        : createRandomObjectId();
    const data = new TextEncoder().encode(value);
    const { encryptedObject } = await sealClient.encrypt({
      threshold: 1,
      packageId: import.meta.env.VITE_SEAL_PACKAGE_ID ?? "",
      id: objectId,
      data,
    });

    return JSON.stringify(
      createRealSealEnvelope({
        network: SUI_NETWORK,
        packageId: import.meta.env.VITE_SEAL_PACKAGE_ID ?? "",
        objectId,
        threshold: 1,
        serverObjectIds: [serverConfig.objectId],
        encryptedObject: toBase64(encryptedObject),
        projectId,
        ownerAddress: projectId ? undefined : ownerAddress,
        policyId: projectId ? "project_admin_v0" : "owner_wallet_v1",
        policyObjectId: projectId ?? ownerAddress ?? objectId,
        approvalPolicy: projectId ? "project_admin_v0" : "owner_wallet_v1",
      }),
    );
  },

  async decrypt(value, context) {
    const envelope = parseRealSealEnvelope(value);
    if (!envelope) {
      throw new Error("Legacy unencrypted response.");
    }

    if (!context?.walletAddress) {
      throw new Error(SEAL_ADMIN_WALLET_REQUIRED_MESSAGE);
    }
    if (!context.suiClient) {
      throw new Error(SEAL_RUNTIME_UNAVAILABLE_MESSAGE);
    }

    context.onStatusChange?.("validating_access_policy");
    const projectId = envelope.projectId ?? context.projectId?.trim();
    const ownerAddress = envelope.ownerAddress ?? context.ownerAddress?.trim();
    if (!projectId && !ownerAddress) {
      throw new Error(SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE);
    }
    if (!projectId && ownerAddress) {
      if (
        context.walletAddress.toLowerCase() !== ownerAddress.toLowerCase() ||
        !doesSealIdMatchOwner(envelope.objectId, ownerAddress)
      ) {
        throw new Error(SEAL_PERMISSION_DENIED_MESSAGE);
      }

      const sessionKey = await getOrCreateSessionKey({
        walletAddress: context.walletAddress,
        packageId: envelope.packageId,
        suiClient: context.suiClient as SealCompatibleClient,
        signPersonalMessage: context.signPersonalMessage,
        onStatusChange: context.onStatusChange,
      });
      context.onStatusChange?.("decrypting_encrypted_payload");
      const txBytes = await buildSealApproveTransactionBytes({
        objectId: envelope.objectId,
        approvalPolicy: "owner_wallet_v1",
        suiClient: context.suiClient as SealCompatibleClient,
        packageId: envelope.packageId,
      });
      const plaintext = await sealClient.decrypt({
        data: fromBase64(envelope.encryptedObject),
        sessionKey,
        txBytes,
      });
      context.onStatusChange?.("signal_unlocked");
      return new TextDecoder().decode(plaintext);
    }
    if (!projectId) {
      throw new Error(SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE);
    }

    try {
      const sessionKey = await getOrCreateSessionKey({
        walletAddress: context.walletAddress,
        packageId: envelope.packageId,
        suiClient: context.suiClient as SealCompatibleClient,
        signPersonalMessage: context.signPersonalMessage,
        onStatusChange: context.onStatusChange,
      });

      const reviewerCapId = context.reviewerCapId?.trim() || undefined;
      const primaryApprovalPolicy =
        envelope.approvalPolicy ??
        (doesSealIdMatchProject(envelope.objectId, projectId)
          ? reviewerCapId
            ? "project_signal_reviewer_v1"
            : "project_signal_v1"
          : reviewerCapId
            ? "project_reviewer_v0"
            : "project_admin_v0");

      let plaintext: Uint8Array;
      try {
        context.onStatusChange?.("decrypting_encrypted_payload");
        const txBytes = await buildSealApproveTransactionBytes({
          objectId: envelope.objectId,
          projectId,
          approvalPolicy: primaryApprovalPolicy,
          reviewerCapId,
          suiClient: context.suiClient as SealCompatibleClient,
          packageId: envelope.packageId,
        });

        plaintext = await sealClient.decrypt({
          data: fromBase64(envelope.encryptedObject),
          sessionKey,
          txBytes,
        });
      } catch (error) {
        const canRetryWithAdminPolicy =
          error instanceof NoAccessError &&
          projectId &&
          (primaryApprovalPolicy === "project_signal_v1" ||
            primaryApprovalPolicy === "project_signal_reviewer_v1");

        if (!canRetryWithAdminPolicy) {
          debugSealClientError(
            "primary_decrypt_failed",
            {
              walletAddress: context.walletAddress,
              packageId: envelope.packageId,
              objectId: envelope.objectId,
              projectId,
              approvalPolicy: primaryApprovalPolicy,
              network: SUI_NETWORK,
            },
            error,
          );
          throw error;
        }

        const fallbackApprovalPolicy = reviewerCapId ? "project_reviewer_v0" : "project_admin_v0";
        debugSealClientError(
          "primary_decrypt_retrying_admin_policy",
          {
            walletAddress: context.walletAddress,
            packageId: envelope.packageId,
            objectId: envelope.objectId,
            projectId,
            approvalPolicy: primaryApprovalPolicy,
            fallbackApprovalPolicy,
            network: SUI_NETWORK,
          },
          error,
        );
        const fallbackTxBytes = await buildSealApproveTransactionBytes({
          objectId: envelope.objectId,
          projectId,
          approvalPolicy: fallbackApprovalPolicy,
          reviewerCapId,
          suiClient: context.suiClient as SealCompatibleClient,
          packageId: envelope.packageId,
        });

        context.onStatusChange?.("decrypting_encrypted_payload");
        plaintext = await sealClient.decrypt({
          data: fromBase64(envelope.encryptedObject),
          sessionKey,
          txBytes: fallbackTxBytes,
        });
      }

      context.onStatusChange?.("signal_unlocked");
      return new TextDecoder().decode(plaintext);
    } catch (error) {
      debugSealClientError(
        "decrypt_failed",
        {
          walletAddress: context.walletAddress,
          packageId: envelope.packageId,
          objectId: envelope.objectId,
          projectId,
          network: SUI_NETWORK,
        },
        error,
      );
      if (isLikelyWalletCancelError(error)) {
        throw createErrorWithCause(SEAL_WALLET_CANCELLED_MESSAGE, error);
      }
      if (error instanceof NoAccessError) {
        throw createErrorWithCause(SEAL_PERMISSION_DENIED_MESSAGE, error);
      }
      if (error instanceof Error && /session|expired|ttl/i.test(error.message)) {
        throw createErrorWithCause(SEAL_SESSION_EXPIRED_MESSAGE, error);
      }
      if (error instanceof Error && error.message === SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE) {
        throw error;
      }
      if (error instanceof Error && error.message === SEAL_NOT_CONFIGURED_MESSAGE) {
        throw createErrorWithCause(SEAL_RUNTIME_UNAVAILABLE_MESSAGE, error);
      }
      throw error instanceof Error ? error : createErrorWithCause(SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE, error);
    }
  },
};

async function buildSealApproveTransactionBytes({
  objectId,
  projectId,
  approvalPolicy,
  reviewerCapId,
  suiClient: activeSuiClient,
  packageId,
}: {
  objectId: string;
  projectId?: string;
  approvalPolicy:
    | "project_signal_v1"
    | "project_admin_v0"
    | "project_signal_reviewer_v1"
    | "project_reviewer_v0"
    | "owner_wallet_v1";
  reviewerCapId?: string;
  suiClient: SealCompatibleClient;
  packageId: string;
}) {
  const tx = new Transaction();
  if (approvalPolicy === "owner_wallet_v1") {
    tx.moveCall({
      target: `${packageId}::project_registry::seal_approve_owner_signal`,
      arguments: [tx.pure.vector("u8", fromHex(objectId))],
    });
    return tx.build({
      client: activeSuiClient,
      onlyTransactionKind: true,
    });
  }
  if (!projectId) {
    throw new Error(SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE);
  }
  if (
    (approvalPolicy === "project_signal_reviewer_v1" || approvalPolicy === "project_reviewer_v0") &&
    (!ACCESS_CONTROL_REGISTRY_ID || !reviewerCapId)
  ) {
    throw new Error(SEAL_PERMISSION_DENIED_MESSAGE);
  }
  tx.moveCall({
    target: `${packageId}::project_registry::${
      approvalPolicy === "project_signal_v1"
        ? "seal_approve_project_signal"
        : approvalPolicy === "project_signal_reviewer_v1"
          ? "seal_approve_project_signal_reviewer"
          : approvalPolicy === "project_reviewer_v0"
            ? "seal_approve_project_reviewer"
            : "seal_approve_project_admin"
    }`,
    arguments:
      approvalPolicy === "project_signal_reviewer_v1" || approvalPolicy === "project_reviewer_v0"
        ? [
            tx.pure.vector("u8", fromHex(objectId)),
            tx.object(ACCESS_CONTROL_REGISTRY_ID),
            tx.object(reviewerCapId ?? ""),
            tx.object(projectId),
          ]
        : [tx.pure.vector("u8", fromHex(objectId)), tx.object(projectId)],
  });
  return tx.build({
    client: activeSuiClient,
    onlyTransactionKind: true,
  });
}

function createSessionCacheKey(walletAddress: string, packageId: string) {
  return `${SESSION_KEY_STORAGE_PREFIX}:${walletAddress.toLowerCase()}:${packageId.toLowerCase()}`;
}

async function getOrCreateSessionKey({
  walletAddress,
  packageId,
  suiClient: activeSuiClient,
  signPersonalMessage,
  onStatusChange,
}: {
  walletAddress: string;
  packageId: string;
  suiClient: SealCompatibleClient;
  signPersonalMessage?: (message: Uint8Array) => Promise<string>;
  onStatusChange?: SealDecryptContext["onStatusChange"];
}) {
  const cacheKey = createSessionCacheKey(walletAddress, packageId);
  const cachedSessionKey = loadCachedSessionKey(cacheKey, activeSuiClient);
  if (cachedSessionKey) {
    return cachedSessionKey;
  }
  const pendingSessionKey = pendingSessionKeyPromises.get(cacheKey);
  if (pendingSessionKey) {
    debugSessionKeyCache("pending_reuse", {
      walletAddress,
      packageId,
    });
    return pendingSessionKey;
  }
  if (!signPersonalMessage) {
    throw new Error(SEAL_ADMIN_WALLET_REQUIRED_MESSAGE);
  }

  const pendingPromise = (async () => {
    onStatusChange?.("waiting_wallet_approval");
    const sessionKey = await SessionKey.create({
      address: walletAddress,
      packageId,
      ttlMin: REAL_SEAL_SESSION_TTL_MIN,
      suiClient: activeSuiClient,
    });
    const signature = await signPersonalMessage(sessionKey.getPersonalMessage());
    await sessionKey.setPersonalMessageSignature(signature);
    persistSessionKey(cacheKey, sessionKey);
    return sessionKey;
  })();
  pendingSessionKeyPromises.set(cacheKey, pendingPromise);
  try {
    return await pendingPromise;
  } finally {
    pendingSessionKeyPromises.delete(cacheKey);
  }
}

function loadCachedSessionKey(cacheKey: string, suiClientForSession: SealCompatibleClient) {
  const inMemory = sessionKeyCache.get(cacheKey);
  if (inMemory) {
    if (!inMemory.isExpired()) {
      debugSessionKeyCache("cache_hit", {
        cacheKey,
        source: "memory",
      });
      return inMemory;
    }
    debugSessionKeyCache("cache_expired", {
      cacheKey,
      source: "memory",
    });
    clearCachedSessionKey(cacheKey);
  }

  if (typeof window === "undefined") {
    debugSessionKeyCache("cache_miss", {
      cacheKey,
      source: "server",
    });
    return null;
  }

  const raw = window.sessionStorage.getItem(cacheKey);
  if (!raw) {
    debugSessionKeyCache("cache_miss", {
      cacheKey,
      source: "sessionStorage",
    });
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Parameters<typeof SessionKey.import>[0];
    const restored = SessionKey.import(parsed, suiClientForSession);
    if (restored.isExpired()) {
      debugSessionKeyCache("cache_expired", {
        cacheKey,
        source: "sessionStorage",
      });
      clearCachedSessionKey(cacheKey);
      return null;
    }
    sessionKeyCache.set(cacheKey, restored);
    debugSessionKeyCache("cache_hit", {
      cacheKey,
      source: "sessionStorage",
    });
    return restored;
  } catch (error) {
    debugSessionKeyCache("import_failed", {
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
    });
    clearCachedSessionKey(cacheKey);
    return null;
  }
}

function persistSessionKey(cacheKey: string, sessionKey: SessionKey) {
  sessionKeyCache.set(cacheKey, sessionKey);
  if (typeof window === "undefined") {
    return;
  }
  try {
    const exported = sessionKey.export();
    window.sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        address: exported.address,
        packageId: exported.packageId,
        mvrName: exported.mvrName,
        creationTimeMs: exported.creationTimeMs,
        ttlMin: exported.ttlMin,
        personalMessageSignature: exported.personalMessageSignature,
        sessionKey: exported.sessionKey,
      }),
    );
  } catch (error) {
    debugSessionKeyCache("persist_failed", {
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
    });
    // Keep the in-memory session key even when sessionStorage is unavailable.
  }
}

function clearCachedSessionKey(cacheKey: string) {
  sessionKeyCache.delete(cacheKey);
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(cacheKey);
}
