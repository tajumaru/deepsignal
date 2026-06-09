import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";
import type { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import {
  SuiSignAndExecuteTransaction,
  SuiSignAndExecuteTransactionBlock,
  SuiSignTransaction,
  SuiSignTransactionBlock,
} from "@mysten/wallet-standard";
import type {
  SuiSignAndExecuteTransactionBlockFeature,
  SuiSignAndExecuteTransactionFeature,
  SuiSignTransactionBlockFeature,
  SuiSignTransactionFeature,
} from "@mysten/wallet-standard";
import { getWalletAccountFeature } from "@wallet-standard/ui";
import { getWalletAccountForUiWalletAccount } from "@wallet-standard/ui-registry";
import {
  RetryableWalrusClientError,
  StorageNodeAPIError,
  WalrusClientError,
  type WalrusClient,
} from "@mysten/walrus";
import {
  deleteFormBlobIndex,
  getFormBlobIndex,
  listFormBlobIndex,
  listSubmissionBlobIndex,
  replaceSubmissionBlobIndex,
  upsertFormBlobIndex,
  upsertSubmissionBlobIndex,
} from "./blobIndex";
import { localStorageAdapter } from "./localStorageAdapter";
import {
  WalrusDiagnosticError,
  getWalrusCauseMessage,
  getWalrusErrorMessage,
  getWalrusErrorResponseBody,
  getWalrusErrorStatus,
  getWalrusErrorUrl,
  isQuotaExceededError,
  isRateLimitError,
  isWalletApprovalError,
  isWalrusDiagnosticError,
} from "./walrusDiagnostics";
import {
  SUI_NETWORK,
  WALRUS_AGGREGATOR_URL,
  WALRUS_UPLOAD_RELAY_URL,
} from "../lib/sui";
import {
  getWalrusRuntimeContext,
  waitForWalrusMutationRuntimeReady,
} from "./walrusRuntime";
import { TatumStorageClientError } from "./tatumClient";
import { createWalrusBlobProof } from "../lib/walrusProof";
import {
  EMBEDDED_ENCRYPTED_PAYLOAD_BLOB_ID,
  assertEncryptedSubmissionLeakGuard,
  sanitizeSubmissionForStorage,
} from "./submissionSanitizer";
import {
  buildSubmissionIndexEntry,
  writeSubmissionRemoteIndexLog,
} from "./submissionDelivery";
import { getTatumStorageWriteUrl, isTatumStorageEnabled, uploadWithTatum } from "./tatumStorage";
import { LEGACY_SCHEMA_HASH, computeSchemaHash, resolveFormVersion } from "../lib/formVersioning";
import type {
  EncryptedSubmissionRecord,
  FormSchema,
  SignalManifest,
  StorageAdapter,
  Submission,
  TatumStorageRecord,
  WalrusBlobProof,
  WalrusActualCost,
} from "../types";

type WalrusEnabledClient = ClientWithCoreApi & { walrus: WalrusClient };
type WalrusStorageMode = "publisher" | "uploadRelay" | "tatum";
type FormBundle = {
  version: 1;
  kind: "formBundle";
  form: FormSchema;
  manifest: SignalManifest;
};
type SubmissionBundle = {
  version: 1;
  kind: "submissionBundle";
  submission: Submission | EncryptedSubmissionRecord;
  manifest: SignalManifest;
  form?: FormSchema;
};
type UploadResult = {
  blobId: string;
  blobObjectId?: string;
  walrusProof: WalrusBlobProof;
  walrusActualCost?: WalrusActualCost;
  tatumStorage?: TatumStorageRecord;
};
type UploadKind =
  | "form-bundle"
  | "submission-bundle"
  | "manifest"
  | "encrypted-payload"
  | "attachment";
type SubmissionSaveResult = {
  id: string;
  blobId?: string;
  encryptedBlobId?: string;
  answerBlobId?: string;
  remoteIndexBlobId?: string;
  remoteIndexTarget?: string;
  remoteIndexUpdated?: boolean;
  remoteIndexReadBack?: boolean;
  ownerReadable?: boolean;
  remoteSyncStatus?: "remote_synced" | "sync_pending" | "local_only";
  walrusProof?: WalrusBlobProof;
  tatumStorage?: TatumStorageRecord;
};
export type WalrusBlobReadErrorCode =
  | "aggregator_unconfigured"
  | "blob_unavailable"
  | "json_parse_failed";

const publisherUrl = import.meta.env.VITE_WALRUS_PUBLISHER_URL?.replace(/\/$/, "");
const aggregatorUrl = WALRUS_AGGREGATOR_URL.replace(/\/$/, "");
const uploadRelayUrl = WALRUS_UPLOAD_RELAY_URL.replace(/\/$/, "");
const submissionRelayUrl = String(import.meta.env.VITE_DEEPSIGNAL_SUBMISSION_RELAY_URL || "").replace(/\/$/, "");
const submissionRelayMode = String(import.meta.env.VITE_DEEPSIGNAL_SUBMISSION_RELAY_MODE || "full").toLowerCase();
const submissionRelayIsAppsScript = submissionRelayUrl.includes("script.google.com/macros/");
const fallbackAggregatorUrls = String(import.meta.env.VITE_WALRUS_FALLBACK_AGGREGATOR_URLS || "")
  .split(",")
  .map((url) => url.trim().replace(/\/$/, ""))
  .filter(Boolean);
const storageEpochs = Math.max(1, Number(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS || "5"));
const bundledFormPointer = "__bundled_form__";
const WALRUS_READ_TIMEOUT_MS = 4000;
const WALRUS_READ_MAX_ATTEMPTS = 3;
const WALRUS_BLOB_READ_CONCURRENCY = 6;
const walrusStorageMode = (() => {
  const configuredMode = String(import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay").toLowerCase();
  if (configuredMode === "publisher") {
    return "publisher" as const;
  }
  if (configuredMode === "tatum") {
    return "tatum" as const;
  }
  return "uploadRelay" as const;
})() satisfies WalrusStorageMode;
let suiTransactionsModulePromise: Promise<typeof import("@mysten/sui/transactions")> | null = null;

function loadSuiTransactionsModule() {
  if (!suiTransactionsModulePromise) {
    suiTransactionsModulePromise = import("@mysten/sui/transactions");
  }
  return suiTransactionsModulePromise;
}

export class WalrusBlobReadError extends Error {
  code: WalrusBlobReadErrorCode;
  blobId: string;

  constructor(code: WalrusBlobReadErrorCode, blobId: string, message: string) {
    super(message);
    this.name = "WalrusBlobReadError";
    this.code = code;
    this.blobId = blobId;
  }
}

function assertReadEnv() {
  if (!aggregatorUrl) {
    throw new Error("Walrus aggregator URL is not configured.");
  }
}

function getReadAggregatorUrls() {
  return [...new Set([aggregatorUrl, ...fallbackAggregatorUrls].filter(Boolean))];
}

function assertPublisherEnv() {
  if (!publisherUrl || !aggregatorUrl) {
    throw new Error("Walrus publisher or aggregator URL is not configured.");
  }
}

function assertUploadRelayEnv() {
  if (!uploadRelayUrl || !aggregatorUrl) {
    throw new Error("Walrus upload relay or aggregator URL is not configured.");
  }
}

function assertTatumEnv() {
  if (!isTatumStorageEnabled() || !getTatumStorageWriteUrl() || !aggregatorUrl) {
    throw new Error("Tatum storage or Walrus aggregator URL is not configured.");
  }
}

function getRuntimeWalrusClient() {
  const runtimeContext = getWalrusRuntimeContext();
  if (!runtimeContext.client) {
    throw new Error("Walrus client is not ready yet. Refresh the page and reconnect your wallet.");
  }
  return runtimeContext.client;
}

function getWalrusClient() {
  assertUploadRelayEnv();
  return getRuntimeWalrusClient();
}

async function withWalrusReadTimeout<T>(blobId: string, task: Promise<T>): Promise<T> {
  return Promise.race([
    task,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(
          new WalrusBlobReadError(
            "blob_unavailable",
            blobId,
            `Walrus blob ${blobId} could not be fetched from the aggregator before the read timed out.`,
          ),
        );
      }, WALRUS_READ_TIMEOUT_MS);
    }),
  ]);
}

function createWalletSigner(): Signer {
  const runtimeContext = getWalrusRuntimeContext();
  const { account, wallet, supportedIntents, client } = runtimeContext;
  if (!account || !wallet || !client) {
    throw new Error(
      "Walrus mutations require a connected wallet. Connect a wallet or continue in local fallback mode.",
    );
  }

  return {
    toSuiAddress() {
      return account.address;
    },
    async signAndExecuteTransaction({
      transaction,
      client: txClient,
    }: {
      transaction: Transaction;
      client?: ClientWithCoreApi;
    }) {
      const activeClient = (txClient as WalrusEnabledClient | undefined) ?? client;
      transaction.setSenderIfNotSet(account.address);
      const chain: `${string}:${string}` = `sui:${SUI_NETWORK}`;
      const underlyingAccount = getWalletAccountForUiWalletAccount(account);
      const walletTransaction = {
        toJSON: async () =>
          transaction.toJSON({
            supportedIntents,
            client: activeClient,
          }),
      };
      let digest: string | undefined;

      try {
        const signAndExecuteFeature = tryGetWalletAccountFeature<SuiSignAndExecuteTransactionFeature[typeof SuiSignAndExecuteTransaction]>(
          account,
          SuiSignAndExecuteTransaction,
        );
        if (signAndExecuteFeature) {
          const execution = await signAndExecuteFeature.signAndExecuteTransaction({
            transaction: walletTransaction,
            account: underlyingAccount,
            chain,
          });
          digest = execution.digest;
        } else {
          const signAndExecuteBlockFeature = tryGetWalletAccountFeature<
            SuiSignAndExecuteTransactionBlockFeature[typeof SuiSignAndExecuteTransactionBlock]
          >(account, SuiSignAndExecuteTransactionBlock);
          if (signAndExecuteBlockFeature) {
            const { Transaction: SuiTransaction } = await loadSuiTransactionsModule();
            const transactionBlock = SuiTransaction.from(await walletTransaction.toJSON());
            const execution = await signAndExecuteBlockFeature.signAndExecuteTransactionBlock({
              account: underlyingAccount,
              chain,
              transactionBlock,
              options: {
                showRawEffects: true,
                showRawInput: true,
              },
            });
            digest = execution.digest;
          } else {
            console.warn("[walrus wallet] missing sign-and-execute features", {
              walletName: wallet.name,
              accountAddress: account.address,
              accountFeatures: [...account.features],
              supportedIntents,
              network: SUI_NETWORK,
            });
            throw new Error(
              `The account ${account.address} does not support signing and executing transactions.`,
            );
          }
        }
      } catch (error) {
        if (!isWalletSignAndExecuteUnsupported(error)) {
          throw error;
        }

        const signed = await signWalletTransaction({
          account,
          underlyingAccount,
          chain,
          walletTransaction,
        });
        const submitted = await activeClient.core.executeTransaction({
          transaction: fromBase64(signed.bytes),
          signatures: [signed.signature],
          include: {
            transaction: true,
            effects: true,
          },
        });

        digest =
          submitted.$kind === "Transaction"
            ? submitted.Transaction.digest
            : submitted.FailedTransaction?.digest;
      }

      if (!digest) {
        throw new Error("Walrus transaction did not return a digest.");
      }
      return activeClient.core.waitForTransaction({
        digest,
        include: {
          transaction: true,
          effects: true,
          objectTypes: true,
        },
      });
    },
  } as unknown as Signer;
}

async function signWalletTransaction({
  account,
  underlyingAccount,
  chain,
  walletTransaction,
}: {
  account: NonNullable<ReturnType<typeof getWalrusRuntimeContext>["account"]>;
  underlyingAccount: ReturnType<typeof getWalletAccountForUiWalletAccount>;
  chain: `${string}:${string}`;
  walletTransaction: {
    toJSON: () => Promise<string>;
  };
}) {
  const signTransactionFeature = tryGetWalletAccountFeature<SuiSignTransactionFeature[typeof SuiSignTransaction]>(
    account,
    SuiSignTransaction,
  );
  if (signTransactionFeature) {
    return await signTransactionFeature.signTransaction({
      transaction: walletTransaction,
      account: underlyingAccount,
      chain,
    });
  }

  const signTransactionBlockFeature = tryGetWalletAccountFeature<
    SuiSignTransactionBlockFeature[typeof SuiSignTransactionBlock]
  >(account, SuiSignTransactionBlock);
  if (signTransactionBlockFeature) {
    const { Transaction: SuiTransaction } = await loadSuiTransactionsModule();
    const transactionBlock = SuiTransaction.from(await walletTransaction.toJSON());
    const signed = await signTransactionBlockFeature.signTransactionBlock({
      transactionBlock,
      account: underlyingAccount,
      chain,
    });
    return {
      bytes: signed.transactionBlockBytes,
      signature: signed.signature,
    };
  }

  console.warn("[walrus wallet] missing sign features", {
    accountAddress: account.address,
    accountFeatures: [...account.features],
    chain,
  });
  throw new Error(`The account ${account.address} does not support signing transactions.`);
}

function isWalletSignAndExecuteUnsupported(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    /does not support the signAndExecuteTransaction feature/i.test(error.message) ||
    /does not support signing and executing transactions/i.test(error.message)
  );
}

function tryGetWalletAccountFeature<TFeature>(
  account: NonNullable<ReturnType<typeof getWalrusRuntimeContext>["account"]>,
  featureName: string,
) {
  try {
    return getWalletAccountFeature(account, featureName as never) as TFeature;
  } catch {
    return null;
  }
}

async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function extractBlobId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Walrus upload response did not include a blob id.");
  }
  const response = payload as {
    blobId?: string;
    id?: string;
    newlyCreated?: { blobObject?: { blobId?: string } };
    alreadyCertified?: { blobId?: string };
    result?: {
      newlyCreated?: { blobObject?: { blobId?: string } };
      alreadyCertified?: { blobId?: string };
      blobId?: string;
      id?: string;
    };
  };
  const blobId =
    response.result?.newlyCreated?.blobObject?.blobId ??
    response.result?.alreadyCertified?.blobId ??
    response.result?.blobId ??
    response.result?.id ??
    response.newlyCreated?.blobObject?.blobId ??
    response.alreadyCertified?.blobId ??
    response.blobId ??
    response.id;
  if (!blobId) {
    throw new Error("Unable to extract Walrus blob id from upload response.");
  }
  return blobId;
}

function extractBlobObjectId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const response = payload as {
    blobObjectId?: string;
    objectId?: string;
    newlyCreated?: { blobObject?: { id?: string } };
    alreadyCertified?: { blobObject?: { id?: string } };
    result?: {
      blobObjectId?: string;
      objectId?: string;
      newlyCreated?: { blobObject?: { id?: string } };
      alreadyCertified?: { blobObject?: { id?: string } };
    };
  };
  return (
    response.result?.newlyCreated?.blobObject?.id ??
    response.result?.alreadyCertified?.blobObject?.id ??
    response.result?.blobObjectId ??
    response.result?.objectId ??
    response.newlyCreated?.blobObject?.id ??
    response.alreadyCertified?.blobObject?.id ??
    response.blobObjectId ??
    response.objectId
  );
}

function parseCostNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWalAmount(value: number | null) {
  if (value === null) {
    return undefined;
  }
  return value > 1_000_000 ? value / 1_000_000_000 : value;
}

function extractPublisherWalrusCost(payload: unknown): WalrusActualCost | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const response = payload as {
    cost?: unknown;
    newlyCreated?: { cost?: unknown };
    result?: {
      cost?: unknown;
      newlyCreated?: { cost?: unknown };
    };
  };
  const rawCost =
    response.result?.newlyCreated?.cost ??
    response.result?.cost ??
    response.newlyCreated?.cost ??
    response.cost;
  const wal = normalizeWalAmount(parseCostNumber(rawCost));
  return typeof wal === "number" ? { wal, source: "publisher" } : undefined;
}

function formatWalrusStorageCost(cost: Awaited<ReturnType<WalrusClient["storageCost"]>>): WalrusActualCost {
  return {
    wal: Number(cost.totalCost) / 1_000_000_000,
    storageWal: Number(cost.storageCost) / 1_000_000_000,
    writeWal: Number(cost.writeCost) / 1_000_000_000,
    source: "sdk-storage-cost",
  };
}

function formatSuiGasFromEffects(effects: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } | null | undefined) {
  const gas = effects?.gasUsed;
  if (!gas) {
    return undefined;
  }
  const mist =
    BigInt(gas.computationCost ?? "0") +
    BigInt(gas.storageCost ?? "0") -
    BigInt(gas.storageRebate ?? "0");
  return Number(mist) / 1_000_000_000;
}

function normalizeWalrusWriteError(error: unknown) {
  if (isWalrusDiagnosticError(error)) {
    if (error.details.stage === "rpc-visibility") {
      return new WalrusDiagnosticError(
        "Walrus transaction submitted, but RPC visibility timed out.",
        {
          ...error.details,
          source: error.details.source ?? "rpc",
          errorName: error.details.errorName ?? error.name,
          causeMessage: error.details.causeMessage ?? getWalrusCauseMessage(error),
          responseBody: error.details.responseBody ?? getWalrusErrorResponseBody(error),
        },
        error,
      );
    }
    return error;
  }

  if (error instanceof Error) {
    const message = error.message;
    const lower = message.toLowerCase();

    if (isQuotaExceededError(error)) {
      return new WalrusDiagnosticError(
        "Walrus upload failed: storage quota exceeded.",
        {
          stage: "upload-relay",
          category: "quota_exceeded",
          source: "upload-relay",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (isRateLimitError(error)) {
      return new WalrusDiagnosticError(
        "Walrus upload failed: the storage service is rate limiting requests.",
        {
          stage: "upload-relay",
          category: "rate_limited",
          source: error instanceof StorageNodeAPIError ? "upload-relay" : "unknown",
          status: getWalrusErrorStatus(error) ?? 429,
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (isWalletApprovalError(error)) {
      return new WalrusDiagnosticError(
        "Wallet approval failed before the Walrus upload started.",
        {
          stage: "wallet-approval",
          source: "wallet",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (error.name === "TimeoutError" || lower.includes("signal timed out")) {
      return new WalrusDiagnosticError(
        walrusStorageMode === "uploadRelay"
          ? "Walrus upload relay timed out before the blob write completed."
          : "Walrus transaction visibility timed out before the write completed.",
        {
          stage: walrusStorageMode === "uploadRelay" ? "upload-relay" : "rpc-visibility",
          source: walrusStorageMode === "uploadRelay" ? "upload-relay" : "rpc",
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (
      lower.includes("insufficientgas") ||
      lower.includes("insufficientcoinbalance") ||
      lower.includes("insufficientbalanceforwithdraw")
    ) {
      return new WalrusDiagnosticError(
        "Walrus storage transaction failed: wallet balance is insufficient for storage cost or gas.",
        {
          stage: "wallet-balance",
          source: "walrus-sdk",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (error instanceof StorageNodeAPIError) {
      if (lower.includes("tip") && (lower.includes("max") || lower.includes("limit"))) {
        return new WalrusDiagnosticError(
          "Walrus upload relay failed: the required relay tip exceeded the configured tip max.",
          {
            stage: "upload-relay",
            source: "upload-relay",
            status: getWalrusErrorStatus(error),
            errorName: error.name,
            causeMessage: getWalrusCauseMessage(error),
            url: getWalrusErrorUrl(error),
            responseBody: getWalrusErrorResponseBody(error),
          },
          error,
        );
      }
      return new WalrusDiagnosticError(
        `Walrus upload relay failed: ${message}`,
        {
          stage: "upload-relay",
          source: "upload-relay",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (lower.includes("failed to certify blob") || lower.includes("certify blob")) {
      return new WalrusDiagnosticError(
        `Walrus certification failed: ${message}`,
        {
          stage: "certification",
          source: "walrus-sdk",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (lower.includes("tip") && (lower.includes("max") || lower.includes("limit"))) {
      return new WalrusDiagnosticError(
        "Walrus upload relay failed: the required relay tip exceeded the configured tip max.",
        {
          stage: "upload-relay",
          source: "upload-relay",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (lower.includes("upload relay")) {
      return new WalrusDiagnosticError(
        `Walrus upload relay failed: ${message}`,
        {
          stage: "upload-relay",
          source: "upload-relay",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }

    if (error instanceof WalrusClientError) {
      return new WalrusDiagnosticError(
        `Walrus storage transaction failed: ${message}`,
        {
          stage: "transaction-execution",
          source: "walrus-sdk",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      );
    }
  }

  return error instanceof Error
    ? new WalrusDiagnosticError(
        getWalrusErrorMessage(error),
        {
          stage: "unknown",
          source: "unknown",
          status: getWalrusErrorStatus(error),
          errorName: error.name,
          causeMessage: getWalrusCauseMessage(error),
          url: getWalrusErrorUrl(error),
          responseBody: getWalrusErrorResponseBody(error),
        },
        error,
      )
    : new WalrusDiagnosticError("Walrus upload failed.", { stage: "unknown" }, error);
}

function isObjectVersionRetryableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("needs to be rebuilt because object") ||
    message.includes("is unavailable for consumption") ||
    message.includes("current version:")
  );
}

function isTransientWalrusWriteError(error: unknown) {
  if (error instanceof RetryableWalrusClientError) {
    return true;
  }
  if (error instanceof StorageNodeAPIError) {
    return error.status === 429 || (typeof error.status === "number" && error.status >= 500);
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    isObjectVersionRetryableError(error) ||
    message.includes("request timed out") ||
    message.includes("timed out") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("current epoch")
  );
}

async function uploadBodyWithPublisher(body: Blob | File, kind: UploadKind): Promise<UploadResult> {
  assertPublisherEnv();
  const startedAt = performance.now();
  const response = await fetch(`${publisherUrl}/v1/blobs`, {
    method: "PUT",
    body,
  });
  const payload = await parseResponseBody(response);
  const durationMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    console.warn("[walrus upload] publisher:error", {
      kind,
      durationMs,
      status: response.status,
      payload,
    });
    throw new Error(`Walrus upload failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  console.info("[walrus upload] publisher:success", {
    kind,
    durationMs,
  });
  return {
    blobId: extractBlobId(payload),
    blobObjectId: extractBlobObjectId(payload),
    walrusProof: createWalrusBlobProof({
      blobId: extractBlobId(payload),
      objectId: extractBlobObjectId(payload),
      size: body.size,
      epoch: storageEpochs,
      network: SUI_NETWORK,
    }),
    walrusActualCost: extractPublisherWalrusCost(payload),
  };
}

async function uploadBodyWithSdk(body: Blob | File, kind: UploadKind): Promise<UploadResult> {
  const blob = new Uint8Array(await body.arrayBuffer());
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = performance.now();
    try {
      console.info("[walrus upload] attempt:start", {
        kind,
        attempt,
        maxAttempts,
        bytes: blob.byteLength,
        mimeType: body.type || "application/octet-stream",
      });
      await waitForWalrusMutationRuntimeReady({ requireWallet: true });
      const client = getWalrusClient();
      const signer = createWalletSigner();
      const owner = getWalrusRuntimeContext().account?.address;
      const walrusCost = await client.walrus.storageCost(blob.byteLength, storageEpochs);
      let registerTxDigest = "";
      const result = await client.walrus.writeBlob({
        blob,
        signer,
        owner,
        epochs: storageEpochs,
        deletable: true,
        attributes: body.type ? { "content-type": body.type } : undefined,
        onStep: (step) => {
          if (step.step === "registered") {
            registerTxDigest = step.txDigest;
          }
        },
      });
      let walrusActualCost = formatWalrusStorageCost(walrusCost);
      if (registerTxDigest) {
        try {
          const tx = await client.core.waitForTransaction({
            digest: registerTxDigest,
            include: { effects: true },
          });
          const effects = (tx as {
            effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } };
            Transaction?: { effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } };
          }).effects ?? (tx as {
            Transaction?: { effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } };
          }).Transaction?.effects;
          const sui = formatSuiGasFromEffects(effects);
          if (typeof sui === "number") {
            walrusActualCost = {
              ...walrusActualCost,
              sui,
              source: "sdk-storage-cost-and-register-gas",
            };
          }
        } catch (gasError) {
          console.warn("[walrus upload] register gas lookup failed", gasError);
        }
      }
      const durationMs = Math.round(performance.now() - startedAt);
      console.info("[walrus upload] attempt:success", {
        kind,
        attempt,
        maxAttempts,
        durationMs,
        blobId: result.blobId,
        blobObjectId: result.blobObject.id,
      });
      return {
        blobId: result.blobId,
        blobObjectId: result.blobObject.id,
        walrusProof: createWalrusBlobProof({
          blobId: result.blobId,
          objectId: result.blobObject.id,
          size: blob.byteLength,
          epoch: storageEpochs,
          network: SUI_NETWORK,
        }),
        walrusActualCost,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      const retryable = isTransientWalrusWriteError(error);
      console.warn("[walrus upload] attempt:error", {
        kind,
        attempt,
        maxAttempts,
        durationMs,
        retryable,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error && error.name === "TimeoutError") {
        console.warn("[walrus upload] timeout", {
          kind,
          attempt,
          maxAttempts,
          durationMs,
          retryable,
        });
      }
      if (attempt < maxAttempts && retryable) {
        await new Promise((resolve) => window.setTimeout(resolve, 500 * 2 ** (attempt - 1)));
        continue;
      }
      throw normalizeWalrusWriteError(error);
    }
  }

  throw new Error("Walrus upload failed.");
}

async function uploadBodyWithTatum(body: Blob | File, kind: UploadKind): Promise<UploadResult> {
  assertTatumEnv();
  try {
    const result = await uploadWithTatum(body, kind);
    return {
      blobId: result.blobId,
      walrusProof: result.walrusProof,
      tatumStorage: result.tatumStorage,
    };
  } catch (error) {
    const tatumDiagnostics = error instanceof TatumStorageClientError ? error.diagnostics : null;
    throw new WalrusDiagnosticError(
      error instanceof Error ? error.message : "Tatum storage upload failed.",
      {
        provider: "tatum",
        stage: "upload-relay",
        source: "tatum",
        category: "storage_unavailable",
        blobId: tatumDiagnostics?.blobId,
        cid: tatumDiagnostics?.cid,
        jobId: tatumDiagnostics?.jobId,
        uploadStatus: tatumDiagnostics?.status,
        status: tatumDiagnostics?.httpStatus,
        errorName: error instanceof Error ? error.name : typeof error,
        causeMessage: getWalrusCauseMessage(error),
        responseBody: tatumDiagnostics?.responseBody ?? getWalrusErrorResponseBody(error),
      },
      error,
    );
  }
}

async function uploadBody(body: Blob | File, kind: UploadKind): Promise<UploadResult> {
  if (walrusStorageMode === "publisher") {
    return uploadBodyWithPublisher(body, kind);
  }
  if (walrusStorageMode === "tatum") {
    return uploadBodyWithTatum(body, kind);
  }
  return uploadBodyWithSdk(body, kind);
}

async function deleteBlobObjectsFromWalrus(blobObjectIds: Array<string | undefined>) {
  let remainingBlobObjectIds = [...new Set(blobObjectIds.filter((value): value is string => Boolean(value)))];
  if (remainingBlobObjectIds.length === 0) {
    return;
  }

  const client = getRuntimeWalrusClient();
  const signer = createWalletSigner();
  while (remainingBlobObjectIds.length > 0) {
    const { Transaction } = await loadSuiTransactionsModule();
    const transaction = appendWalrusBlobDeletesToTransaction({
      transaction: new Transaction(),
      blobObjectIds: remainingBlobObjectIds,
      ownerAddress: signer.toSuiAddress(),
    });

    try {
      await signer.signAndExecuteTransaction({
        transaction,
        client,
      });
      return;
    } catch (error) {
      const missingObjectIds = extractMissingWalrusDeleteObjectIds(error);
      if (missingObjectIds.length === 0) {
        throw error;
      }

      const missingSet = new Set(missingObjectIds);
      const nextRemainingBlobObjectIds = remainingBlobObjectIds.filter(
        (blobObjectId) => !missingSet.has(blobObjectId.toLowerCase()),
      );
      if (nextRemainingBlobObjectIds.length === remainingBlobObjectIds.length) {
        throw error;
      }

      console.warn(
        "Skipping already-missing Walrus objects during delete.",
        nextRemainingBlobObjectIds.length === 0 ? [...missingSet] : [...missingSet, "retrying remaining objects"],
      );
      remainingBlobObjectIds = nextRemainingBlobObjectIds;
    }
  }
}

export function extractMissingWalrusDeleteObjectIds(error: unknown) {
  const message = getWalrusErrorMessage(error);
  const matches = [...message.matchAll(/Object\s+(0x[a-f0-9]+)\s+does not exist/gi)];
  return [...new Set(matches.map((match) => match[1]?.toLowerCase()).filter((value): value is string => Boolean(value)))];
}

export function appendWalrusBlobDeletesToTransaction(args: {
  transaction: Transaction;
  blobObjectIds: Array<string | undefined>;
  ownerAddress?: string | null;
}) {
  const uniqueBlobObjectIds = [...new Set(args.blobObjectIds.filter((value): value is string => Boolean(value)))];
  if (uniqueBlobObjectIds.length === 0) {
    return args.transaction;
  }

  const client = getRuntimeWalrusClient();
  const ownerAddress = args.ownerAddress?.trim() || getWalrusRuntimeContext().account?.address;
  if (!ownerAddress) {
    throw new Error("Wallet address is required to delete Walrus blobs.");
  }

  let transaction = args.transaction;
  for (const blobObjectId of uniqueBlobObjectIds) {
    transaction = client.walrus.deleteBlobTransaction({
      blobObjectId,
      owner: ownerAddress,
      transaction,
    });
  }
  return transaction;
}

async function cleanupSupersededWalrusObjects(blobObjectIds: Array<string | undefined>, context: string) {
  try {
    await deleteBlobObjectsFromWalrus(blobObjectIds);
  } catch (error) {
    console.warn(`Walrus cleanup skipped after ${context}.`, error);
  }
}

export function shouldCleanupSupersededManifestObjects(manifest: Pick<SignalManifest, "version"> | null | undefined) {
  return Boolean(manifest && manifest.version < 2);
}

export function getPreservedCleanupObjectIdsForSubmissionUpdate(
  submission: Pick<Submission, "isEncrypted" | "encryptedBlobId" | "receiptBlobId">,
  formEntry: ReturnType<typeof getFormBlobIndex>,
  submissionEntries: ReturnType<typeof listSubmissionBlobIndex>,
) {
  if (!submission.isEncrypted) {
    return new Set<string>();
  }

  const referencedBlobIds = new Set(
    [submission.encryptedBlobId, submission.receiptBlobId].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ),
  );
  if (referencedBlobIds.size === 0) {
    return new Set<string>();
  }

  const preservedObjectIds = new Set<string>();
  const rememberObjectId = (blobId?: string, objectId?: string) => {
    if (!blobId || !objectId || !referencedBlobIds.has(blobId)) {
      return;
    }
    preservedObjectIds.add(objectId);
  };

  rememberObjectId(formEntry?.formBlobId, formEntry?.formBlobObjectId);
  rememberObjectId(formEntry?.manifestBlobId, formEntry?.manifestBlobObjectId);
  submissionEntries.forEach((entry) => {
    rememberObjectId(entry.blobId, entry.blobObjectId);
  });

  return preservedObjectIds;
}

function getMissingDeleteTargets(
  formEntry: ReturnType<typeof getFormBlobIndex>,
  submissionEntries: ReturnType<typeof listSubmissionBlobIndex>,
) {
  const missingTrackedObjects: string[] = [];
  if (formEntry?.formBlobId && !formEntry.formBlobObjectId) {
    missingTrackedObjects.push("form");
  }
  if (formEntry?.manifestBlobId && !formEntry.manifestBlobObjectId) {
    missingTrackedObjects.push("manifest");
  }
  if (submissionEntries.some((entry) => entry.blobId && !entry.blobObjectId)) {
    missingTrackedObjects.push("submission");
  }
  return missingTrackedObjects;
}

function warnAboutPartialDelete(formId: string, missingTrackedObjects: string[]) {
  if (missingTrackedObjects.length === 0) {
    return;
  }
  console.warn(
    `Walrus deletion for form ${formId} is partial because ${missingTrackedObjects.join(
      ", ",
    )} blob object ids are missing. This data was likely saved before delete tracking was enabled.`,
  );
}

export function collectWalrusBlobDeleteObjectIds(formIds: string[]) {
  const uniqueIds = [...new Set(formIds)];
  const trackedBlobObjectIds: string[] = [];

  for (const id of uniqueIds) {
    const formEntry = getFormBlobIndex(id);
    const submissionEntries = listSubmissionBlobIndex(id);
    const missingTrackedObjects = getMissingDeleteTargets(formEntry, submissionEntries);

    trackedBlobObjectIds.push(
      formEntry?.formBlobObjectId ?? "",
      formEntry?.manifestBlobObjectId ?? "",
      ...submissionEntries.map((entry) => entry.blobObjectId ?? ""),
    );
    warnAboutPartialDelete(id, missingTrackedObjects);
  }

  return [...new Set(trackedBlobObjectIds.filter(Boolean))];
}

async function fetchBlobTextFromWalrus(
  blobId: string,
  logLabel: "Walrus blob read failed" | "Walrus text blob read failed",
): Promise<string | null> {
  if (!blobId.trim()) {
    return null;
  }
  assertReadEnv();
  for (const gateway of getReadAggregatorUrls()) {
    for (let attempt = 1; attempt <= WALRUS_READ_MAX_ATTEMPTS; attempt += 1) {
      try {
        console.debug("[walrus read] attempt:start", {
          blobId,
          gateway,
          attempt,
          maxAttempts: WALRUS_READ_MAX_ATTEMPTS,
        });
        const response = await withWalrusReadTimeout(blobId, fetch(`${gateway}/v1/blobs/${blobId}`));
        if (response.status === 404) {
          return null;
        }
        if (!response.ok) {
          throw new Error(`Walrus fetch failed: ${response.status}`);
        }
        return await response.text();
      } catch (error) {
        console.debug("[walrus read] attempt:error", {
          blobId,
          gateway,
          attempt,
          maxAttempts: WALRUS_READ_MAX_ATTEMPTS,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          rawError: error,
        });
        if (attempt === WALRUS_READ_MAX_ATTEMPTS) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250 * attempt));
      }
    }
  }
  console.error(logLabel, blobId);
  return null;
}

async function fetchBlobTextFromWalrusOrThrow(blobId: string): Promise<string> {
  if (!blobId.trim()) {
    throw new WalrusBlobReadError("blob_unavailable", blobId, "Walrus blob id is missing.");
  }
  try {
    assertReadEnv();
    let lastError: unknown;
    for (const gateway of getReadAggregatorUrls()) {
      for (let attempt = 1; attempt <= WALRUS_READ_MAX_ATTEMPTS; attempt += 1) {
        try {
          console.debug("[walrus read] attempt:start", {
            blobId,
            gateway,
            attempt,
            maxAttempts: WALRUS_READ_MAX_ATTEMPTS,
          });
          const response = await withWalrusReadTimeout(blobId, fetch(`${gateway}/v1/blobs/${blobId}`));
          if (response.status === 404) {
            throw new WalrusBlobReadError(
              "blob_unavailable",
              blobId,
              `Walrus blob ${blobId} could not be fetched from the aggregator.`,
            );
          }
          if (!response.ok) {
            throw new WalrusBlobReadError(
              "blob_unavailable",
              blobId,
              `Walrus fetch failed for blob ${blobId}: ${response.status}.`,
            );
          }
          return await response.text();
        } catch (error) {
          lastError = error;
          console.debug("[walrus read] attempt:error", {
            blobId,
            gateway,
            attempt,
            maxAttempts: WALRUS_READ_MAX_ATTEMPTS,
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            rawError: error,
          });
          if (attempt === WALRUS_READ_MAX_ATTEMPTS) {
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250 * attempt));
        }
      }
    }
    throw lastError ?? new Error(`Walrus blob ${blobId} could not be fetched from the aggregator.`);
  } catch (error) {
    if (error instanceof WalrusBlobReadError) {
      throw error;
    }
    if (error instanceof Error && error.message === "Walrus aggregator URL is not configured.") {
      throw new WalrusBlobReadError("aggregator_unconfigured", blobId, error.message);
    }
    const message =
      error instanceof Error
        ? `Walrus blob ${blobId} could not be fetched from the aggregator. ${error.message}`
        : `Walrus blob ${blobId} could not be fetched from the aggregator.`;
    throw new WalrusBlobReadError("blob_unavailable", blobId, message);
  }
}

async function fetchBlobFromWalrus(blobId: string): Promise<Blob | null> {
  if (!blobId.trim()) {
    return null;
  }
  assertReadEnv();
  for (const gateway of getReadAggregatorUrls()) {
    for (let attempt = 1; attempt <= WALRUS_READ_MAX_ATTEMPTS; attempt += 1) {
      try {
        console.debug("[walrus read] attempt:start", {
          blobId,
          gateway,
          attempt,
          maxAttempts: WALRUS_READ_MAX_ATTEMPTS,
        });
        const response = await withWalrusReadTimeout(blobId, fetch(`${gateway}/v1/blobs/${blobId}`));
        if (response.status === 404) {
          return null;
        }
        if (!response.ok) {
          throw new Error(`Walrus fetch failed: ${response.status}`);
        }
        return await response.blob();
      } catch (error) {
        console.debug("[walrus read] attempt:error", {
          blobId,
          gateway,
          attempt,
          maxAttempts: WALRUS_READ_MAX_ATTEMPTS,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          rawError: error,
        });
        if (attempt === WALRUS_READ_MAX_ATTEMPTS) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250 * attempt));
      }
    }
  }
  console.error("Walrus binary blob read failed", blobId);
  return null;
}

export async function fetchJsonBlob<T>(blobId: string): Promise<T | null> {
  if (!blobId.trim()) {
    return null;
  }
  const text = await fetchBlobTextFromWalrus(blobId, "Walrus blob read failed");
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Walrus blob parse failed", blobId, error);
    return null;
  }
}

export async function readJsonBlobOrThrow<T>(blobId: string): Promise<T> {
  const text = await fetchBlobTextFromWalrusOrThrow(blobId);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Walrus blob parse failed", blobId, error);
    throw new WalrusBlobReadError(
      "json_parse_failed",
      blobId,
      `Walrus blob ${blobId} did not contain valid JSON.`,
    );
  }
}

async function fetchTextBlob(blobId: string): Promise<string | null> {
  if (!blobId.trim()) {
    return null;
  }
  return fetchBlobTextFromWalrus(blobId, "Walrus text blob read failed");
}

function extractEmbeddedEncryptedPayload(value: string) {
  try {
    const payload = JSON.parse(value) as unknown;
    if (isSubmissionBundle(payload)) {
      return typeof payload.submission.encryptedPayload === "string"
        ? payload.submission.encryptedPayload
        : null;
    }
    if (
      payload &&
      typeof payload === "object" &&
      "encryptedPayload" in payload &&
      typeof payload.encryptedPayload === "string"
    ) {
      return payload.encryptedPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function createManifest(
  form: Pick<FormSchema, "id" | "createdAt" | "headerImage" | "headerLogo" | "formVersion" | "schemaHash" | "processingMode"> & {
    title?: string;
  },
  formBlobId: string,
  submissions: SignalManifest["submissions"],
  updatedAt: string,
  previousVersions: SignalManifest["versions"] = [],
): SignalManifest {
  const currentVersion = resolveFormVersion(form);
  const previousVersion = previousVersions.find((version) => version.version === currentVersion);
  const schemaHash = form.schemaHash || previousVersion?.schemaHash || computeSchemaHash({ ...form, fields: [], sections: [] });
  const versionFormBlobId =
    formBlobId === bundledFormPointer && previousVersion?.formBlobId
      ? previousVersion.formBlobId
      : formBlobId;
  const versions = [
    ...previousVersions.filter((version) => version.version !== currentVersion),
    {
      version: currentVersion,
      formBlobId: versionFormBlobId,
      schemaHash,
      createdAt: form.createdAt,
      publishedAt: updatedAt,
      titleSnapshot: form.title ?? previousVersion?.titleSnapshot,
    },
  ].sort((left, right) => left.version - right.version);
  return {
    version: 2,
    formId: form.id,
    createdAt: form.createdAt,
    updatedAt,
    formBlobId,
    currentVersion,
    versions,
    headerImage: form.headerImage,
    headerLogo: form.headerLogo,
    processingMode: form.processingMode ?? "review_required",
    submissions: submissions
      .map((submission) => ({
        ...submission,
        formVersion: submission.formVersion ?? currentVersion,
        formBlobId: submission.formBlobId ?? versionFormBlobId,
        schemaHash: submission.schemaHash ?? schemaHash,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

export function normalizeManifest(
  manifest: SignalManifest,
  options: { carrierBlobId: string; form?: FormSchema | null } | null,
): SignalManifest {
  const form = options?.form ?? null;
  const currentVersion = manifest.currentVersion ?? resolveFormVersion(form ?? {});
  const formBlobId =
    manifest.formBlobId === bundledFormPointer && options?.carrierBlobId
      ? options.carrierBlobId
      : manifest.formBlobId;
  const schemaHash = form?.schemaHash || manifest.versions?.find((version) => version.version === currentVersion)?.schemaHash || LEGACY_SCHEMA_HASH;
  const versions = (manifest.versions?.length
    ? manifest.versions
    : [
        {
          version: currentVersion,
          formBlobId,
          schemaHash,
          createdAt: manifest.createdAt,
          publishedAt: manifest.updatedAt,
          titleSnapshot: form?.title,
        },
      ]).map((version) => ({
        ...version,
        version: resolveFormVersion({ formVersion: version.version }),
        formBlobId: !version.formBlobId || version.formBlobId === bundledFormPointer ? formBlobId : version.formBlobId,
        schemaHash: version.schemaHash || schemaHash,
        createdAt: version.createdAt || manifest.createdAt,
        publishedAt: version.publishedAt || manifest.updatedAt,
      }));

  return {
    ...manifest,
    version: 2,
    formBlobId,
    currentVersion,
    versions,
    processingMode: manifest.processingMode ?? form?.processingMode ?? "review_required",
    submissions: manifest.submissions.map((submission) => ({
      ...submission,
      formVersion: submission.formVersion ?? currentVersion,
      formBlobId: submission.formBlobId ?? formBlobId,
      schemaHash: submission.schemaHash ?? schemaHash,
    })),
  };
}

function isFormBundle(payload: unknown): payload is FormBundle {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<FormBundle>;
  return (
    candidate.kind === "formBundle" &&
    candidate.version === 1 &&
    Boolean(candidate.form) &&
    Boolean(candidate.manifest)
  );
}

function isSubmissionBundle(payload: unknown): payload is SubmissionBundle {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<SubmissionBundle>;
  return (
    candidate.kind === "submissionBundle" &&
    candidate.version === 1 &&
    Boolean(candidate.submission) &&
    Boolean(candidate.manifest)
  );
}

function createFormBundle(form: FormSchema, manifest: SignalManifest): FormBundle {
  return {
    version: 1,
    kind: "formBundle",
    form,
    manifest,
  };
}

async function readManifestCarrier(blobId: string) {
  const payload = await readJsonBlobOrThrow<unknown>(blobId);
  if (isFormBundle(payload)) {
    return {
      manifest: normalizeManifest(payload.manifest, { carrierBlobId: blobId, form: payload.form }),
      form: payload.form,
    };
  }

  if (isSubmissionBundle(payload)) {
    return {
      manifest: normalizeManifest(payload.manifest, { carrierBlobId: blobId, form: payload.form ?? null }),
      form: payload.form ?? null,
    };
  }

  return {
    manifest: normalizeManifest(payload as SignalManifest, { carrierBlobId: blobId, form: null }),
    form: null as FormSchema | null,
  };
}

export async function readManifestWithForm(blobId: string): Promise<{
  manifest: SignalManifest;
  form: FormSchema | null;
}> {
  return readManifestCarrier(blobId);
}

function createSubmissionBundle(
  submission: Submission | EncryptedSubmissionRecord,
  manifest: SignalManifest,
  form?: FormSchema | null,
): SubmissionBundle {
  return {
    version: 1,
    kind: "submissionBundle",
    submission,
    manifest,
    ...(form ? { form } : {}),
  };
}

function getSubmissionProjectId(submission: Submission) {
  return submission.projectId ?? (typeof submission.metadata?.projectId === "string" ? submission.metadata.projectId : "");
}

function getSubmitterMode(submission: Submission) {
  const identityKind = submission.respondentMeta?.identityKind;
  if (identityKind === "zklogin") {
    return "zkLogin" as const;
  }
  if (identityKind === "sui_wallet") {
    return "wallet" as const;
  }
  return "anonymous" as const;
}

function createRemoteIndexLog(
  submission: Submission,
  overrides: Partial<Parameters<typeof writeSubmissionRemoteIndexLog>[0]>,
) {
  const submitterMode = getSubmitterMode(submission);
  writeSubmissionRemoteIndexLog({
    event: "submission_remote_index_write",
    submissionId: submission.id,
    projectId: getSubmissionProjectId(submission) || null,
    formId: submission.formId,
    signalId: typeof submission.onchainSignalId === "number" ? String(submission.onchainSignalId) : submission.id,
    answerBlobId: submission.answerBlobId ?? submission.receiptBlobId ?? submission.blobId ?? null,
    submitterMode,
    submitterWallet:
      submitterMode === "anonymous"
        ? null
        : submission.respondentMeta?.verifiedAddress ?? submission.respondentMeta?.walletAddress ?? null,
    anonymousSessionId: submitterMode === "anonymous" ? submission.respondentMeta?.sessionId ?? null : null,
    remoteIndexTarget: null,
    remoteIndexWriteSuccess: false,
    remoteIndexReadBackSuccess: false,
    ownerReadable: false,
    storageMode: walrusStorageMode,
    fallbackUsed: false,
    syncPending: true,
    ...overrides,
  });
}

async function saveSubmissionThroughRelay(submission: Submission): Promise<SubmissionSaveResult | null> {
  if (!submissionRelayUrl || submissionRelayMode === "index") {
    return null;
  }

  const response = await fetch(`${submissionRelayUrl}/v1/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      submission,
      indexEntry: buildSubmissionIndexEntry(
        submission,
        submission.answerBlobId ?? submission.receiptBlobId ?? submission.blobId ?? "",
        "remote_synced",
      ),
    }),
  });
  const payload = await parseResponseBody(response) as Partial<SubmissionSaveResult> & {
    error?: string;
    message?: string;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Submission relay failed: ${response.status}`);
  }
  if (!payload?.answerBlobId || !payload.remoteIndexUpdated || !payload.remoteIndexReadBack || !payload.ownerReadable) {
    throw new Error("Submission relay did not confirm owner-readable remote index delivery.");
  }
  return {
    id: payload.id ?? submission.id,
    blobId: payload.blobId ?? payload.answerBlobId,
    answerBlobId: payload.answerBlobId,
    remoteIndexBlobId: payload.remoteIndexBlobId,
    remoteIndexTarget: payload.remoteIndexTarget ?? submissionRelayUrl,
    remoteIndexUpdated: true,
    remoteIndexReadBack: true,
    ownerReadable: true,
    remoteSyncStatus: "remote_synced",
    walrusProof: payload.walrusProof,
    tatumStorage: payload.tatumStorage,
  };
}

async function registerSubmissionIndexThroughRelay(args: {
  submission: Submission;
  answerBlobId: string;
}): Promise<SubmissionSaveResult | null> {
  if (!submissionRelayUrl || submissionRelayMode !== "index") {
    return null;
  }

  const relayBody = JSON.stringify({
    submission: args.submission,
    indexEntry: buildSubmissionIndexEntry(args.submission, args.answerBlobId, "remote_synced"),
  });

  if (submissionRelayIsAppsScript) {
    await fetch(submissionRelayUrl, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: relayBody,
      mode: "no-cors",
    });
    return {
      id: args.submission.id,
      blobId: args.answerBlobId,
      answerBlobId: args.answerBlobId,
      remoteIndexTarget: "google-apps-script-drive",
      remoteIndexUpdated: true,
      remoteIndexReadBack: false,
      ownerReadable: false,
      remoteSyncStatus: "sync_pending",
    };
  }

  const response = await fetch(`${submissionRelayUrl}/v1/submissions-index`, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: relayBody,
  });
  const payload = await parseResponseBody(response) as Partial<SubmissionSaveResult> & {
    error?: string;
    message?: string;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Submission index relay failed: ${response.status}`);
  }
  if (!payload?.remoteIndexUpdated || !payload.remoteIndexReadBack || !payload.ownerReadable) {
    throw new Error("Submission index relay did not confirm owner-readable index delivery.");
  }
  return {
    id: payload.id ?? args.submission.id,
    blobId: args.answerBlobId,
    answerBlobId: args.answerBlobId,
    remoteIndexBlobId: payload.remoteIndexBlobId,
    remoteIndexTarget: payload.remoteIndexTarget ?? submissionRelayUrl,
    remoteIndexUpdated: true,
    remoteIndexReadBack: true,
    ownerReadable: true,
    remoteSyncStatus: "remote_synced",
  };
}

async function verifyRemoteIndexReadBack(bundleBlobId: string, submissionId: string) {
  try {
    const carrier = await readManifestCarrier(bundleBlobId);
    return Boolean(
      carrier.manifest?.submissions.some(
        (entry) => entry.submissionId === submissionId && entry.blobId === bundleBlobId,
      ),
    );
  } catch {
    return false;
  }
}

export function serializeSubmissionBundle(
  submission: Submission | EncryptedSubmissionRecord,
  manifest: SignalManifest,
  form?: FormSchema | null,
  options: { allowEncryptedPayload?: boolean } = {},
) {
  if (submission.isEncrypted) {
    assertEncryptedSubmissionLeakGuard(submission, options);
  }
  return JSON.stringify(createSubmissionBundle(submission, manifest, form));
}

async function writeFormBundle(form: FormSchema, manifest: SignalManifest) {
  return uploadBody(
    new Blob([JSON.stringify(createFormBundle(form, manifest))], {
      type: "application/json",
    }),
    "form-bundle",
  );
}

async function writeSubmissionBundle(
  submission: Submission | EncryptedSubmissionRecord,
  manifest: SignalManifest,
  form?: FormSchema | null,
  options: { allowEncryptedPayload?: boolean } = {},
) {
  if (submission.isEncrypted) {
    assertEncryptedSubmissionLeakGuard(submission, options);
  }
  return uploadBody(
    new Blob([serializeSubmissionBundle(submission, manifest, form, options)], {
      type: "application/json",
    }),
    "submission-bundle",
  );
}

async function readSubmissionRecord(blobId: string): Promise<Submission | null> {
  const payload = await fetchJsonBlob<unknown>(blobId);
  if (!payload) {
    return null;
  }
  if (isSubmissionBundle(payload)) {
    if (
      payload.submission.isEncrypted &&
      payload.submission.encryptedPayload &&
      (!payload.submission.encryptedBlobId ||
        payload.submission.encryptedBlobId === EMBEDDED_ENCRYPTED_PAYLOAD_BLOB_ID)
    ) {
      return {
        ...payload.submission,
        encryptedBlobId: blobId,
      };
    }
    return payload.submission;
  }
  if (isFormBundle(payload)) {
    return null;
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "isEncrypted" in payload &&
    payload.isEncrypted === true &&
    "encryptedPayload" in payload &&
    typeof payload.encryptedPayload === "string" &&
    (!("encryptedBlobId" in payload) || payload.encryptedBlobId === EMBEDDED_ENCRYPTED_PAYLOAD_BLOB_ID)
  ) {
    return {
      ...(payload as Submission),
      encryptedBlobId: blobId,
    };
  }
  return payload as Submission;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

async function loadManifestOrThrow(formId: string) {
  const entry = getFormBlobIndex(formId);
  if (!entry?.manifestBlobId) {
    return { entry, manifest: null as SignalManifest | null };
  }
  if (entry.formBlobId === entry.manifestBlobId) {
    const carrier = await readManifestCarrier(entry.manifestBlobId);
    if (!carrier?.form) {
      throw new Error(`Unable to read bundled form blob for form ${formId}.`);
    }
    return {
      entry,
      manifest: carrier.manifest,
      form: carrier.form,
      bundledBlobId: entry.manifestBlobId,
    };
  }
  const carrier = await readManifestCarrier(entry.manifestBlobId);
  if (!carrier?.manifest) {
    throw new Error(`Unable to read manifest blob for form ${formId}.`);
  }
  return {
    entry,
    manifest: carrier.manifest,
    form: carrier.form,
    bundledBlobId: null as string | null,
  };
}

export function getWalrusBlobUrl(blobId: string) {
  if (!aggregatorUrl) {
    return null;
  }
  return `${aggregatorUrl}/v1/blobs/${blobId}`;
}

export async function saveManifest(manifest: SignalManifest): Promise<UploadResult> {
  return uploadBody(
    new Blob([JSON.stringify(manifest)], { type: "application/json" }),
    "manifest",
  );
}

export async function readManifest(blobId: string): Promise<SignalManifest | null> {
  try {
    const carrier = await readManifestWithForm(blobId);
    return carrier.manifest;
  } catch {
    return null;
  }
}

async function saveSubmissionRecord(
  submission: Submission,
  options: { allowEmbeddedEncryptedPayload?: boolean } = {},
) {
  const allowEmbeddedEncryptedPayload = options.allowEmbeddedEncryptedPayload === true;
  const encryptedSubmissionOptions = { allowEncryptedPayload: allowEmbeddedEncryptedPayload };
  const sanitizedSubmission = sanitizeSubmissionForStorage(submission, encryptedSubmissionOptions);
  if (sanitizedSubmission.isEncrypted) {
    assertEncryptedSubmissionLeakGuard(sanitizedSubmission, encryptedSubmissionOptions);
  }
  const relaySaved = await saveSubmissionThroughRelay(sanitizedSubmission as Submission);
  if (relaySaved) {
    await localStorageAdapter.saveSubmission({
      ...sanitizedSubmission,
      blobId: relaySaved.blobId,
      answerBlobId: relaySaved.answerBlobId,
      receiptBlobId: relaySaved.answerBlobId ?? relaySaved.blobId,
      remoteIndexBlobId: relaySaved.remoteIndexBlobId,
      remoteIndexTarget: relaySaved.remoteIndexTarget,
      remoteIndexUpdated: true,
      remoteIndexReadBack: true,
      ownerReadable: true,
      remoteSyncStatus: "remote_synced",
      walrusProof: relaySaved.walrusProof,
      tatumStorage: relaySaved.tatumStorage,
      ...(allowEmbeddedEncryptedPayload ? { encryptedBlobId: relaySaved.encryptedBlobId ?? relaySaved.blobId, encryptedPayload: undefined } : {}),
    });
    createRemoteIndexLog(sanitizedSubmission as Submission, {
      answerBlobId: relaySaved.answerBlobId ?? relaySaved.blobId ?? null,
      remoteIndexTarget: relaySaved.remoteIndexTarget ?? submissionRelayUrl,
      remoteIndexWriteSuccess: true,
      remoteIndexReadBackSuccess: true,
      ownerReadable: true,
      fallbackUsed: false,
      syncPending: false,
    });
    return relaySaved;
  }
  const { entry, manifest, form } = await loadManifestOrThrow(submission.formId);
  if (!entry?.manifestBlobId || !manifest) {
    if (sanitizedSubmission.isEncrypted) {
      assertEncryptedSubmissionLeakGuard(sanitizedSubmission, encryptedSubmissionOptions);
    }
    const { blobId, blobObjectId, walrusProof, tatumStorage } = await uploadBody(
      new Blob([JSON.stringify(sanitizedSubmission)], { type: "application/json" }),
      "submission-bundle",
    );
    await localStorageAdapter.saveSubmission({
      ...sanitizedSubmission,
      blobId,
      answerBlobId: blobId,
      receiptBlobId: blobId,
      remoteIndexUpdated: false,
      remoteIndexReadBack: false,
      ownerReadable: false,
      remoteSyncStatus: "sync_pending",
      walrusProof,
      tatumStorage,
      ...(allowEmbeddedEncryptedPayload ? { encryptedBlobId: blobId, encryptedPayload: undefined } : {}),
    });
    upsertSubmissionBlobIndex({
      submissionId: sanitizedSubmission.id,
      formId: sanitizedSubmission.formId,
      blobId,
      blobObjectId,
      createdAt: sanitizedSubmission.createdAt,
    });
    createRemoteIndexLog(sanitizedSubmission as Submission, {
      answerBlobId: blobId,
      remoteIndexTarget: "missing-form-manifest",
      remoteIndexWriteSuccess: false,
      remoteIndexReadBackSuccess: false,
      ownerReadable: false,
      syncPending: true,
    });
    return {
      id: sanitizedSubmission.id,
      blobId,
      answerBlobId: blobId,
      remoteIndexTarget: "missing-form-manifest",
      remoteIndexUpdated: false,
      remoteIndexReadBack: false,
      ownerReadable: false,
      remoteSyncStatus: "sync_pending",
      walrusProof,
      tatumStorage,
      ...(allowEmbeddedEncryptedPayload ? { encryptedBlobId: blobId } : {}),
    } satisfies SubmissionSaveResult;
  }

  const existingSubmissionObjectIds = Object.fromEntries(
    listSubmissionBlobIndex(sanitizedSubmission.formId).map((item) => [item.submissionId, item.blobObjectId]),
  );
  const nextManifestEntries = [
    {
      submissionId: sanitizedSubmission.id,
      blobId: "",
      createdAt: sanitizedSubmission.createdAt,
      formVersion: sanitizedSubmission.formVersion,
      formBlobId: sanitizedSubmission.formBlobId,
      schemaHash: sanitizedSubmission.schemaHash,
    },
    ...manifest.submissions.filter((item) => item.submissionId !== sanitizedSubmission.id),
  ];
  const nextManifest = createManifest(
    {
      id: manifest.formId,
      createdAt: manifest.createdAt,
      headerImage: form?.headerImage ?? manifest.headerImage,
      headerLogo: form?.headerLogo ?? manifest.headerLogo,
      formVersion: manifest.currentVersion,
      schemaHash: manifest.versions?.find((version) => version.version === manifest.currentVersion)?.schemaHash,
      processingMode: form?.processingMode ?? manifest.processingMode ?? "review_required",
      title: form?.title ?? manifest.versions?.find((version) => version.version === manifest.currentVersion)?.titleSnapshot,
    },
    form ? bundledFormPointer : manifest.formBlobId,
    nextManifestEntries,
    new Date().toISOString(),
    manifest.versions,
  );
  const bundle = await writeSubmissionBundle(sanitizedSubmission, nextManifest, form, encryptedSubmissionOptions);
  nextManifest.submissions[0].blobId = bundle.blobId;
  const readBackSuccess = await verifyRemoteIndexReadBack(bundle.blobId, sanitizedSubmission.id);
  let indexRelaySaved: SubmissionSaveResult | null = null;
  try {
    indexRelaySaved = await registerSubmissionIndexThroughRelay({
      submission: sanitizedSubmission as Submission,
      answerBlobId: bundle.blobId,
    });
  } catch (error) {
    console.warn("[deepsignal] submission index relay registration failed", {
      submissionId: sanitizedSubmission.id,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  const remoteIndexTarget = indexRelaySaved?.remoteIndexTarget ?? "walrus-manifest-bundle";
  const remoteIndexBlobId = indexRelaySaved?.remoteIndexBlobId ?? bundle.blobId;
  const remoteIndexReadBack = indexRelaySaved?.remoteIndexReadBack ?? readBackSuccess;
  const ownerReadable = indexRelaySaved?.ownerReadable ?? false;
  const remoteSyncStatus = indexRelaySaved?.remoteSyncStatus ?? "sync_pending";

  upsertFormBlobIndex({
    formId: sanitizedSubmission.formId,
    formBlobId: form ? bundle.blobId : manifest.formBlobId,
    formBlobObjectId: form ? bundle.blobObjectId : entry.formBlobObjectId,
    manifestBlobId: bundle.blobId,
    manifestBlobObjectId: bundle.blobObjectId,
    createdAt: manifest.createdAt,
  });
  replaceSubmissionBlobIndex(
    sanitizedSubmission.formId,
    nextManifest.submissions.map((manifestEntry) => ({
      submissionId: manifestEntry.submissionId,
      formId: sanitizedSubmission.formId,
      blobId: manifestEntry.blobId,
      blobObjectId:
        manifestEntry.submissionId === sanitizedSubmission.id
          ? bundle.blobObjectId
          : existingSubmissionObjectIds[manifestEntry.submissionId],
      createdAt: manifestEntry.createdAt,
    })),
  );
  await localStorageAdapter.saveSubmission({
    ...sanitizedSubmission,
    blobId: bundle.blobId,
    answerBlobId: bundle.blobId,
    receiptBlobId: bundle.blobId,
    remoteIndexBlobId,
    remoteIndexTarget,
    remoteIndexUpdated: true,
    remoteIndexReadBack,
    ownerReadable,
    remoteSyncStatus,
    walrusProof: bundle.walrusProof,
    tatumStorage: bundle.tatumStorage,
    ...(allowEmbeddedEncryptedPayload ? { encryptedBlobId: bundle.blobId, encryptedPayload: undefined } : {}),
  });
  if (!allowEmbeddedEncryptedPayload && shouldCleanupSupersededManifestObjects(manifest)) {
    await cleanupSupersededWalrusObjects([
      entry.manifestBlobObjectId,
      form ? entry.formBlobObjectId : undefined,
    ], `saving submission ${sanitizedSubmission.id}`);
  }
  createRemoteIndexLog(sanitizedSubmission as Submission, {
    answerBlobId: bundle.blobId,
    remoteIndexTarget,
    remoteIndexWriteSuccess: true,
    remoteIndexReadBackSuccess: remoteIndexReadBack,
    ownerReadable,
    syncPending: remoteSyncStatus !== "remote_synced",
  });
  return {
    id: sanitizedSubmission.id,
    blobId: bundle.blobId,
    answerBlobId: bundle.blobId,
    remoteIndexBlobId,
    remoteIndexTarget,
    remoteIndexUpdated: true,
    remoteIndexReadBack,
    ownerReadable,
    remoteSyncStatus,
    walrusProof: bundle.walrusProof,
    tatumStorage: bundle.tatumStorage,
    ...(allowEmbeddedEncryptedPayload ? { encryptedBlobId: bundle.blobId } : {}),
  } satisfies SubmissionSaveResult;
}

export const walrusAdapter: StorageAdapter = {
  async saveForm(form: FormSchema) {
    let previousManifest: SignalManifest | null = null;
    try {
      previousManifest = (await loadManifestOrThrow(form.id)).manifest;
    } catch (error) {
      console.warn("[deepsignal] existing manifest could not be loaded before form publish; continuing with a fresh manifest", {
        formId: form.id,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    const previousVersions = previousManifest?.versions ?? [];
    const previousCurrentVersion = previousManifest?.currentVersion ?? 1;
    const currentVersionRecord = previousVersions.find((version) => version.version === previousCurrentVersion);
    const nextSchemaHash = computeSchemaHash(form);
    const hasExistingResponses = Boolean(previousManifest?.submissions.length);
    const shouldCreateNewVersion = Boolean(
      hasExistingResponses &&
        currentVersionRecord?.schemaHash &&
        currentVersionRecord.schemaHash !== nextSchemaHash &&
        resolveFormVersion(form) <= previousCurrentVersion,
    );
    const publishForm = {
      ...form,
      formVersion: shouldCreateNewVersion ? previousCurrentVersion + 1 : resolveFormVersion(form),
      schemaHash: nextSchemaHash,
    } satisfies FormSchema;
    const manifest = createManifest(
      publishForm,
      bundledFormPointer,
      previousManifest?.submissions ?? [],
      new Date().toISOString(),
      previousVersions,
    );
    const { blobId, blobObjectId, walrusActualCost, tatumStorage } = await writeFormBundle(publishForm, manifest);
    upsertFormBlobIndex({
      formId: publishForm.id,
      formBlobId: blobId,
      formBlobObjectId: blobObjectId,
      manifestBlobId: blobId,
      manifestBlobObjectId: blobObjectId,
      createdAt: publishForm.createdAt,
    });
    await localStorageAdapter.saveForm({ ...publishForm, blobId, manifestBlobId: blobId, walrusActualCost, tatumStorage });
    return {
      id: publishForm.id,
      formVersion: publishForm.formVersion,
      schemaHash: publishForm.schemaHash,
      blobId,
      manifestBlobId: blobId,
      walrusActualCost,
      tatumStorage,
    };
  },

  async getForm(id) {
    const index = getFormBlobIndex(id);
    if (!index) {
      return null;
    }
    if (index.formBlobId === index.manifestBlobId) {
      const carrier = await readManifestCarrier(index.formBlobId);
      return carrier?.form
        ? {
            ...carrier.form,
            blobId: index.formBlobId,
            manifestBlobId: index.manifestBlobId,
          }
        : null;
    }
    const form = await fetchJsonBlob<FormSchema>(index.formBlobId);
    return form
      ? {
          ...form,
          blobId: index.formBlobId,
          manifestBlobId: index.manifestBlobId,
        }
      : null;
  },

  async listForms() {
    const entries = listFormBlobIndex();
    const forms = await mapWithConcurrency(
      entries,
      WALRUS_BLOB_READ_CONCURRENCY,
      async (entry) => {
        if (entry.formBlobId === entry.manifestBlobId) {
          const carrier = await readManifestCarrier(entry.formBlobId);
          return carrier?.form ?? null;
        }
        return fetchJsonBlob<FormSchema>(entry.formBlobId);
      },
    );
    return forms.reduce<FormSchema[]>((accumulator, formRecord, index) => {
      if (formRecord) {
        accumulator.push({
          ...formRecord,
          blobId: entries[index].formBlobId,
          manifestBlobId: entries[index].manifestBlobId,
        });
      }
      return accumulator;
    }, []);
  },

  async deleteForm(id) {
    await this.deleteForms([id]);
  },

  async deleteForms(ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return;
    }

    const trackedBlobObjectIds: Array<string | undefined> = [];
    for (const id of uniqueIds) {
      const formEntry = getFormBlobIndex(id);
      const submissionEntries = listSubmissionBlobIndex(id);
      const missingTrackedObjects = getMissingDeleteTargets(formEntry, submissionEntries);
      trackedBlobObjectIds.push(
        formEntry?.formBlobObjectId,
        formEntry?.manifestBlobObjectId,
        ...submissionEntries.map((entry) => entry.blobObjectId),
      );
      warnAboutPartialDelete(id, missingTrackedObjects);
    }

    if (trackedBlobObjectIds.some(Boolean)) {
      await deleteBlobObjectsFromWalrus(trackedBlobObjectIds);
    }

    uniqueIds.forEach((id) => deleteFormBlobIndex(id));
  },

  async saveSubmission(submission: Submission) {
    return saveSubmissionRecord(submission);
  },

  async saveEncryptedSubmission(submission: Submission) {
    return saveSubmissionRecord(submission, { allowEmbeddedEncryptedPayload: true });
  },

  async listSubmissions(formId) {
    const manifestBlobId = getFormBlobIndex(formId)?.manifestBlobId;
    if (manifestBlobId) {
      const manifest = (await readManifestCarrier(manifestBlobId))?.manifest ?? null;
      if (manifest) {
        const submissions = await mapWithConcurrency(
          manifest.submissions,
          WALRUS_BLOB_READ_CONCURRENCY,
          (entry) => readSubmissionRecord(entry.blobId),
        );
        return submissions.reduce<Submission[]>((accumulator, submission, index) => {
          if (submission) {
            accumulator.push({
              ...submission,
              blobId: manifest.submissions[index].blobId,
            });
          }
          return accumulator;
        }, []);
      }
    }

    const entries = listSubmissionBlobIndex(formId);
    const submissions = await mapWithConcurrency(
      entries,
      WALRUS_BLOB_READ_CONCURRENCY,
      (entry) => readSubmissionRecord(entry.blobId),
    );
    return submissions.reduce<Submission[]>((accumulator, submission, index) => {
      if (submission) {
        accumulator.push({ ...submission, blobId: entries[index].blobId });
      }
      return accumulator;
    }, []);
  },

  async updateSubmission(submission) {
    const sanitizedSubmission = sanitizeSubmissionForStorage(submission);
    if (sanitizedSubmission.isEncrypted) {
      assertEncryptedSubmissionLeakGuard(sanitizedSubmission);
    }
    const { entry, manifest, form } = await loadManifestOrThrow(submission.formId);
    if (!entry?.manifestBlobId || !manifest) {
      if (sanitizedSubmission.isEncrypted) {
        assertEncryptedSubmissionLeakGuard(sanitizedSubmission);
      }
      const { blobId, blobObjectId, walrusProof, tatumStorage } = await uploadBody(
        new Blob([JSON.stringify(sanitizedSubmission)], { type: "application/json" }),
        "submission-bundle",
      );
      await localStorageAdapter.updateSubmission({ ...sanitizedSubmission, blobId, walrusProof, tatumStorage });
      upsertSubmissionBlobIndex({
        submissionId: sanitizedSubmission.id,
        formId: sanitizedSubmission.formId,
        blobId,
        blobObjectId,
        createdAt: sanitizedSubmission.createdAt,
      });
      return;
    }

    const existingSubmissionEntries = listSubmissionBlobIndex(sanitizedSubmission.formId);
    const preservedCleanupObjectIds = getPreservedCleanupObjectIdsForSubmissionUpdate(
      sanitizedSubmission,
      entry,
      existingSubmissionEntries,
    );
    const existingSubmissionObjectIds = Object.fromEntries(
      existingSubmissionEntries.map((item) => [item.submissionId, item.blobObjectId]),
    );
    const existingCreatedAt =
      manifest.submissions.find((item) => item.submissionId === sanitizedSubmission.id)?.createdAt ??
      sanitizedSubmission.createdAt;
    const nextManifestEntries = [
      {
        submissionId: sanitizedSubmission.id,
        blobId: "",
        createdAt: existingCreatedAt,
        formVersion: sanitizedSubmission.formVersion,
        formBlobId: sanitizedSubmission.formBlobId,
        schemaHash: sanitizedSubmission.schemaHash,
      },
      ...manifest.submissions.filter((item) => item.submissionId !== sanitizedSubmission.id),
    ];
    const nextManifest = createManifest(
      {
        id: manifest.formId,
        createdAt: manifest.createdAt,
        headerImage: form?.headerImage ?? manifest.headerImage,
        headerLogo: form?.headerLogo ?? manifest.headerLogo,
        formVersion: manifest.currentVersion,
        schemaHash: manifest.versions?.find((version) => version.version === manifest.currentVersion)?.schemaHash,
        processingMode: form?.processingMode ?? manifest.processingMode ?? "review_required",
        title: form?.title ?? manifest.versions?.find((version) => version.version === manifest.currentVersion)?.titleSnapshot,
      },
      form ? bundledFormPointer : manifest.formBlobId,
      nextManifestEntries,
      new Date().toISOString(),
      manifest.versions,
    );
    const bundle = await writeSubmissionBundle(sanitizedSubmission, nextManifest, form);
    nextManifest.submissions[0].blobId = bundle.blobId;

    upsertFormBlobIndex({
      formId: sanitizedSubmission.formId,
      formBlobId: form ? bundle.blobId : manifest.formBlobId,
      formBlobObjectId: form ? bundle.blobObjectId : entry.formBlobObjectId,
      manifestBlobId: bundle.blobId,
      manifestBlobObjectId: bundle.blobObjectId,
      createdAt: manifest.createdAt,
    });
    replaceSubmissionBlobIndex(
      sanitizedSubmission.formId,
      nextManifest.submissions.map((manifestEntry) => ({
        submissionId: manifestEntry.submissionId,
        formId: sanitizedSubmission.formId,
        blobId: manifestEntry.blobId,
        blobObjectId:
          manifestEntry.submissionId === sanitizedSubmission.id
            ? bundle.blobObjectId
            : existingSubmissionObjectIds[manifestEntry.submissionId],
        createdAt: manifestEntry.createdAt,
      })),
    );
    await localStorageAdapter.updateSubmission({
      ...sanitizedSubmission,
      blobId: bundle.blobId,
      walrusProof: bundle.walrusProof,
      tatumStorage: bundle.tatumStorage,
    });
    if (shouldCleanupSupersededManifestObjects(manifest)) {
      await cleanupSupersededWalrusObjects(
        [entry.manifestBlobObjectId, form ? entry.formBlobObjectId : undefined].filter(
          (objectId) => objectId && !preservedCleanupObjectIds.has(objectId),
        ),
        `updating submission ${sanitizedSubmission.id}`,
      );
    }
  },

  async saveEncryptedPayload(payload) {
    const { blobId, walrusProof, tatumStorage } = await uploadBody(
      new Blob([payload], { type: "text/plain" }),
      "encrypted-payload",
    );
    return { blobId, walrusProof, tatumStorage };
  },

  async readEncryptedPayload(blobId) {
    const payload = await fetchTextBlob(blobId);
    if (!payload) {
      return null;
    }
    return extractEmbeddedEncryptedPayload(payload) ?? payload;
  },

  async uploadFile(file) {
    const { blobId, walrusProof, tatumStorage } = await uploadBody(file, "attachment");
    return {
      blobId,
      walrusProof,
      tatumStorage,
      url: getWalrusBlobUrl(blobId) ?? undefined,
    };
  },

  async readFileBlob(blobId) {
    return fetchBlobFromWalrus(blobId);
  },

  async readFileText(blobId) {
    return fetchTextBlob(blobId);
  },
};
