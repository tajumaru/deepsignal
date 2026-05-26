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
import { SUI_NETWORK } from "../lib/sui";
import { getSuiRuntimeContext } from "../suiRuntime";
import { serializeDecryptError } from "./decryptDiagnostics";
import {
  createOwnerScopedSealId,
  createProjectScopedSealId,
  createRealSealEnvelope,
  createSealPolicySnapshot,
  doesSealIdMatchOwner,
  fromBase64,
  isLikelyWalletCancelError,
  normalizeOptionalSealIdentifier,
  normalizeSealIdentifier,
  parseRealSealEnvelope,
  REAL_SEAL_SESSION_TTL_MIN,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_DECRYPT_APPROVAL_REQUIRED_MESSAGE,
  SEAL_NOT_CONFIGURED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE,
  SEAL_RUNTIME_UNAVAILABLE_MESSAGE,
  SEAL_SESSION_EXPIRED_MESSAGE,
  SEAL_WALLET_CANCELLED_MESSAGE,
  selectProjectSealApprovalPolicy,
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

const defaultSuiClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl(requestedNetwork),
  network: requestedNetwork,
});

const sealClientCache = new WeakMap<SealCompatibleClient, SealClient>();

function createSealClient(suiClient: SealCompatibleClient) {
  return new SealClient({
    suiClient,
    serverConfigs: [serverConfig],
  });
}

function getActiveSealCompatibleClient(contextClient?: SealCompatibleClient) {
  if (contextClient) {
    return contextClient;
  }
  const runtimeClient = getSuiRuntimeContext().client;
  if (runtimeClient) {
    return runtimeClient;
  }
  return defaultSuiClient as unknown as SealCompatibleClient;
}

function getSealClientForActiveRpc(contextClient?: SealCompatibleClient) {
  const activeClient = getActiveSealCompatibleClient(contextClient);
  const cachedClient = sealClientCache.get(activeClient);
  if (cachedClient) {
    return cachedClient;
  }
  const nextClient = createSealClient(activeClient);
  sealClientCache.set(activeClient, nextClient);
  return nextClient;
}

const SESSION_KEY_STORAGE_PREFIX = "deepsignal.seal.sessionKey";
const sessionKeyCache = new Map<string, SessionKey>();
const pendingSessionKeyPromises = new Map<string, Promise<SessionKey>>();

export function clearSealSessionCache() {
  sessionKeyCache.clear();
  pendingSessionKeyPromises.clear();
}

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
    const projectId = normalizeOptionalSealIdentifier(context?.projectId);
    const ownerAddress = normalizeOptionalSealIdentifier(context?.ownerAddress);
    const packageId = normalizeSealIdentifier(import.meta.env.VITE_SEAL_PACKAGE_ID ?? "");
    const serverObjectId = normalizeSealIdentifier(serverConfig.objectId);
    const objectId = projectId
      ? createProjectScopedSealId(projectId)
      : ownerAddress
        ? createOwnerScopedSealId(ownerAddress)
        : createRandomObjectId();
    const data = new TextEncoder().encode(value);
    const sealClient = getSealClientForActiveRpc();
    const { encryptedObject } = await sealClient.encrypt({
      threshold: 1,
      packageId,
      id: objectId,
      data,
    });
    const policyId = projectId ? "project_admin_v0" : "owner_wallet_v1";
    const policyObjectId = projectId ?? ownerAddress ?? objectId;
    const encryptPolicySnapshot = createSealPolicySnapshot({
      network: SUI_NETWORK,
      packageId,
      objectId,
      policyId,
      policyObjectId,
      projectId,
      ownerAddress: projectId ? undefined : ownerAddress,
      walletAddress: projectId ? undefined : ownerAddress,
      serverObjectIds: [serverObjectId],
    });

    return JSON.stringify(
      createRealSealEnvelope({
        network: SUI_NETWORK,
        packageId,
        objectId,
        threshold: 1,
        serverObjectIds: [serverObjectId],
        encryptedObject: toBase64(encryptedObject),
        projectId,
        ownerAddress: projectId ? undefined : ownerAddress,
        policyId,
        policyObjectId,
        approvalPolicy: policyId,
        encryptPolicySnapshot,
      }),
    );
  },

  async decrypt(value, context) {
    const activeSuiClient = getActiveSealCompatibleClient(
      context?.suiClient as SealCompatibleClient | undefined,
    );
    const sealClient = getSealClientForActiveRpc(activeSuiClient);
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
    const projectId = normalizeOptionalSealIdentifier(envelope.projectId ?? context.projectId);
    const ownerAddress = normalizeOptionalSealIdentifier(envelope.ownerAddress ?? context.ownerAddress);
    const walletAddress = normalizeSealIdentifier(context.walletAddress);
    if (!projectId && !ownerAddress) {
      throw new Error(SEAL_PROJECT_CONTEXT_REQUIRED_MESSAGE);
    }
    if (!projectId && ownerAddress) {
      if (
        walletAddress !== ownerAddress ||
        !doesSealIdMatchOwner(envelope.objectId, ownerAddress)
      ) {
        throw new Error(SEAL_PERMISSION_DENIED_MESSAGE);
      }

      const sessionKey = await getOrCreateSessionKey({
        walletAddress,
        packageId: envelope.packageId,
        suiClient: activeSuiClient,
        signPersonalMessage: context.signPersonalMessage,
        onStatusChange: context.onStatusChange,
      });
      context.onStatusChange?.("decrypting_encrypted_payload");
        const txBytes = await buildSealApproveTransactionBytes({
          objectId: envelope.objectId,
          approvalPolicy: "owner_wallet_v1",
          suiClient: activeSuiClient,
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
        walletAddress,
        packageId: envelope.packageId,
        suiClient: activeSuiClient,
        signPersonalMessage: context.signPersonalMessage,
        onStatusChange: context.onStatusChange,
      });

      const primaryApprovalPolicy = selectProjectSealApprovalPolicy({
        envelopeApprovalPolicy: envelope.approvalPolicy,
        objectId: envelope.objectId,
        projectId,
      });

      let plaintext: Uint8Array;
      try {
        context.onStatusChange?.("decrypting_encrypted_payload");
        const txBytes = await buildSealApproveTransactionBytes({
          objectId: envelope.objectId,
          projectId,
          approvalPolicy: primaryApprovalPolicy,
          suiClient: activeSuiClient,
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
          primaryApprovalPolicy === "project_signal_v1";

        if (!canRetryWithAdminPolicy) {
          debugSealClientError(
            "primary_decrypt_failed",
            {
              walletAddress,
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

        const fallbackApprovalPolicy = "project_admin_v0";
        debugSealClientError(
          "primary_decrypt_retrying_admin_policy",
          {
            walletAddress,
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
          suiClient: activeSuiClient,
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
          walletAddress,
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
  suiClient: activeSuiClient,
  packageId,
}: {
  objectId: string;
  projectId?: string;
  approvalPolicy:
    | "project_signal_v1"
    | "project_admin_v0"
    | "owner_wallet_v1";
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

function createSessionCacheKey(walletAddress: string, packageId: string) {
  return `${SESSION_KEY_STORAGE_PREFIX}:${normalizeSealIdentifier(walletAddress)}:${normalizeSealIdentifier(packageId)}`;
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
  const normalizedWalletAddress = normalizeSealIdentifier(walletAddress);
  const normalizedPackageId = normalizeSealIdentifier(packageId);
  const cacheKey = createSessionCacheKey(normalizedWalletAddress, normalizedPackageId);
  const cachedSessionKey = loadCachedSessionKey(cacheKey, activeSuiClient);
  if (cachedSessionKey) {
    return cachedSessionKey;
  }
  const pendingSessionKey = pendingSessionKeyPromises.get(cacheKey);
  if (pendingSessionKey) {
    debugSessionKeyCache("pending_reuse", {
      walletAddress: normalizedWalletAddress,
      packageId: normalizedPackageId,
    });
    return pendingSessionKey;
  }
  if (!signPersonalMessage) {
    throw new Error(SEAL_ADMIN_WALLET_REQUIRED_MESSAGE);
  }

  const pendingPromise = (async () => {
    onStatusChange?.("waiting_wallet_approval");
    const sessionKey = await SessionKey.create({
      address: normalizedWalletAddress,
      packageId: normalizedPackageId,
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
