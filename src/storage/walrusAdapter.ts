import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import {
  signAndExecuteTransaction,
  type WalletAccount,
  type WalletWithRequiredFeatures,
} from "@mysten/wallet-standard";
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
  getWalrusErrorMessage,
  isWalrusDiagnosticError,
} from "./walrusDiagnostics";
import {
  SUI_NETWORK,
  WALRUS_AGGREGATOR_URL,
  WALRUS_UPLOAD_RELAY_URL,
} from "../lib/sui";
import {
  EMBEDDED_ENCRYPTED_PAYLOAD_BLOB_ID,
  assertEncryptedSubmissionLeakGuard,
  sanitizeSubmissionForStorage,
} from "./submissionSanitizer";
import type {
  EncryptedSubmissionRecord,
  FormSchema,
  SignalManifest,
  StorageAdapter,
  Submission,
  WalrusActualCost,
} from "../types";

type WalrusEnabledClient = ClientWithCoreApi & { walrus: WalrusClient };
type WalrusStorageMode = "publisher" | "uploadRelay";
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
  walrusActualCost?: WalrusActualCost;
};
type UploadKind =
  | "form-bundle"
  | "submission-bundle"
  | "manifest"
  | "encrypted-payload"
  | "attachment";
type WalrusRuntimeContext = {
  account: WalletAccount | null;
  wallet: WalletWithRequiredFeatures | null;
  supportedIntents: string[];
  client: WalrusEnabledClient | null;
};
export type WalrusBlobReadErrorCode =
  | "aggregator_unconfigured"
  | "blob_unavailable"
  | "json_parse_failed";

const publisherUrl = import.meta.env.VITE_WALRUS_PUBLISHER_URL?.replace(/\/$/, "");
const aggregatorUrl = WALRUS_AGGREGATOR_URL.replace(/\/$/, "");
const uploadRelayUrl = WALRUS_UPLOAD_RELAY_URL.replace(/\/$/, "");
const fallbackAggregatorUrls = String(import.meta.env.VITE_WALRUS_FALLBACK_AGGREGATOR_URLS || "")
  .split(",")
  .map((url) => url.trim().replace(/\/$/, ""))
  .filter(Boolean);
const storageEpochs = Math.max(1, Number(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS || "5"));
const bundledFormPointer = "__bundled_form__";
const WALRUS_READ_TIMEOUT_MS = 4000;
const WALRUS_READ_MAX_ATTEMPTS = 3;
const WALRUS_BLOB_READ_CONCURRENCY = 6;
const walrusStorageMode = (
  String(import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay").toLowerCase() === "publisher"
    ? "publisher"
    : "uploadRelay"
) satisfies WalrusStorageMode;

let runtimeContext: WalrusRuntimeContext = {
  account: null,
  wallet: null,
  supportedIntents: [],
  client: null,
};
const runtimeListeners = new Set<() => void>();
const WALRUS_RUNTIME_READY_TIMEOUT_MS = 5000;

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

export function setWalrusRuntimeContext(next: WalrusRuntimeContext) {
  runtimeContext = next;
  runtimeListeners.forEach((listener) => listener());
}

export function subscribeWalrusRuntime(listener: () => void) {
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}

export function getWalrusMutationRuntimeStatus() {
  return {
    aggregatorConfigured: Boolean(aggregatorUrl),
    writeConfigured: walrusStorageMode === "publisher" ? Boolean(publisherUrl) : Boolean(uploadRelayUrl),
    hasClient: Boolean(runtimeContext.client),
    hasWallet: Boolean(runtimeContext.account && runtimeContext.wallet),
    canWrite: Boolean(
      aggregatorUrl &&
        (walrusStorageMode === "publisher" ? publisherUrl : uploadRelayUrl) &&
        runtimeContext.client &&
        runtimeContext.account &&
        runtimeContext.wallet,
    ),
    storageMode: walrusStorageMode,
  };
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

function getRuntimeWalrusClient() {
  if (!runtimeContext.client) {
    throw new Error("Walrus client is not ready yet. Refresh the page and reconnect your wallet.");
  }
  return runtimeContext.client;
}

function getWalrusClient() {
  assertUploadRelayEnv();
  return getRuntimeWalrusClient();
}

function isWalrusMutationRuntimeReady(requireWallet: boolean) {
  if (!runtimeContext.client) {
    return false;
  }
  if (requireWallet && (!runtimeContext.account || !runtimeContext.wallet)) {
    return false;
  }
  return true;
}

export async function waitForWalrusMutationRuntimeReady({
  requireWallet = true,
  timeoutMs = WALRUS_RUNTIME_READY_TIMEOUT_MS,
}: {
  requireWallet?: boolean;
  timeoutMs?: number;
} = {}) {
  if (walrusStorageMode === "publisher") {
    return;
  }
  assertUploadRelayEnv();
  if (isWalrusMutationRuntimeReady(requireWallet)) {
    return;
  }

  console.info("[walrus runtime] waiting for mutation runtime", {
    requireWallet,
    timeoutMs,
    hasClient: Boolean(runtimeContext.client),
    hasWallet: Boolean(runtimeContext.account && runtimeContext.wallet),
  });

  await new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("Walrus client is not ready yet. Refresh the page and reconnect your wallet."));
    }, timeoutMs);
    unsubscribe = subscribeWalrusRuntime(() => {
      if (!isWalrusMutationRuntimeReady(requireWallet)) {
        return;
      }
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
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
      const execution = await signAndExecuteTransaction(wallet, {
        transaction: {
          toJSON: async () =>
            transaction.toJSON({
              supportedIntents,
              client: activeClient,
            }),
        },
        account,
        chain: `sui:${SUI_NETWORK}`,
      });

      return activeClient.core.waitForTransaction({
        digest: execution.digest,
        include: {
          transaction: true,
          effects: true,
          objectTypes: true,
        },
      });
    },
  } as unknown as Signer;
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
        error.details,
        error,
      );
    }
    return error;
  }

  if (error instanceof Error) {
    const message = error.message;
    const lower = message.toLowerCase();

    if (error.name === "TimeoutError" || lower.includes("signal timed out")) {
      return new WalrusDiagnosticError(
        walrusStorageMode === "uploadRelay"
          ? "Walrus upload relay timed out before the blob write completed."
          : "Walrus transaction visibility timed out before the write completed.",
        {
          stage: walrusStorageMode === "uploadRelay" ? "upload-relay" : "rpc-visibility",
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
        { stage: "wallet-balance" },
        error,
      );
    }

    if (error instanceof StorageNodeAPIError) {
      if (lower.includes("tip") && (lower.includes("max") || lower.includes("limit"))) {
        return new WalrusDiagnosticError(
          "Walrus upload relay failed: the required relay tip exceeded the configured tip max.",
          { stage: "upload-relay" },
          error,
        );
      }
      return new WalrusDiagnosticError(`Walrus upload relay failed: ${message}`, { stage: "upload-relay" }, error);
    }

    if (lower.includes("failed to certify blob") || lower.includes("certify blob")) {
      return new WalrusDiagnosticError(`Walrus certification failed: ${message}`, { stage: "certification" }, error);
    }

    if (lower.includes("tip") && (lower.includes("max") || lower.includes("limit"))) {
      return new WalrusDiagnosticError(
        "Walrus upload relay failed: the required relay tip exceeded the configured tip max.",
        { stage: "upload-relay" },
        error,
      );
    }

    if (lower.includes("upload relay")) {
      return new WalrusDiagnosticError(`Walrus upload relay failed: ${message}`, { stage: "upload-relay" }, error);
    }

    if (error instanceof WalrusClientError) {
      return new WalrusDiagnosticError(
        `Walrus storage transaction failed: ${message}`,
        { stage: "transaction-execution" },
        error,
      );
    }
  }

  return error instanceof Error
    ? new WalrusDiagnosticError(getWalrusErrorMessage(error), { stage: "unknown" }, error)
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
      const owner = runtimeContext.account?.address;
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

async function uploadBody(body: Blob | File, kind: UploadKind): Promise<UploadResult> {
  if (walrusStorageMode === "publisher") {
    return uploadBodyWithPublisher(body, kind);
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
    let transaction = new Transaction();
    for (const blobObjectId of remainingBlobObjectIds) {
      transaction = client.walrus.deleteBlobTransaction({
        blobObjectId,
        owner: signer.toSuiAddress(),
        transaction,
      });
    }

    try {
      await signer.signAndExecuteTransaction({
        transaction,
        client,
      });
      return;
    } catch (error) {
      const missingObjectIds = extractMissingObjectIdsFromDeleteError(error);
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

function extractMissingObjectIdsFromDeleteError(error: unknown) {
  const message = getWalrusErrorMessage(error);
  const matches = [...message.matchAll(/Object\s+(0x[a-f0-9]+)\s+does not exist/gi)];
  return [...new Set(matches.map((match) => match[1]?.toLowerCase()).filter((value): value is string => Boolean(value)))];
}

async function cleanupSupersededWalrusObjects(blobObjectIds: Array<string | undefined>, context: string) {
  try {
    await deleteBlobObjectsFromWalrus(blobObjectIds);
  } catch (error) {
    console.warn(`Walrus cleanup skipped after ${context}.`, error);
  }
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

function createManifest(
  form: Pick<FormSchema, "id" | "createdAt" | "headerImage" | "headerLogo">,
  formBlobId: string,
  submissions: SignalManifest["submissions"],
  updatedAt: string,
): SignalManifest {
  return {
    version: 1,
    formId: form.id,
    createdAt: form.createdAt,
    updatedAt,
    formBlobId,
    headerImage: form.headerImage,
    headerLogo: form.headerLogo,
    submissions: submissions.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
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

async function readFormBundle(blobId: string): Promise<FormBundle | null> {
  const payload = await readJsonBlobOrThrow<unknown>(blobId);
  return isFormBundle(payload) ? payload : null;
}

async function readSubmissionBundle(blobId: string): Promise<SubmissionBundle | null> {
  const payload = await readJsonBlobOrThrow<unknown>(blobId);
  return isSubmissionBundle(payload) ? payload : null;
}

async function readManifestCarrier(blobId: string) {
  const formBundle = await readFormBundle(blobId);
  if (formBundle) {
    return {
      manifest: formBundle.manifest,
      form: formBundle.form,
    };
  }

  const submissionBundle = await readSubmissionBundle(blobId);
  if (submissionBundle) {
    return {
      manifest: submissionBundle.manifest,
      form: submissionBundle.form ?? null,
    };
  }

  const manifest = await readJsonBlobOrThrow<SignalManifest>(blobId);
  return {
    manifest,
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

export const walrusAdapter: StorageAdapter = {
  async saveForm(form: FormSchema) {
    const manifest = createManifest(form, bundledFormPointer, [], form.createdAt);
    const { blobId, blobObjectId, walrusActualCost } = await writeFormBundle(form, manifest);
    upsertFormBlobIndex({
      formId: form.id,
      formBlobId: blobId,
      formBlobObjectId: blobObjectId,
      manifestBlobId: blobId,
      manifestBlobObjectId: blobObjectId,
      createdAt: form.createdAt,
    });
    await localStorageAdapter.saveForm({ ...form, blobId, manifestBlobId: blobId, walrusActualCost });
    return { id: form.id, blobId, manifestBlobId: blobId, walrusActualCost };
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
    const allowEmbeddedEncryptedPayload =
      submission.isEncrypted === true &&
      typeof submission.encryptedPayload === "string" &&
      submission.encryptedPayload.trim().length > 0;
    const encryptedSubmissionOptions = { allowEncryptedPayload: allowEmbeddedEncryptedPayload };
    const sanitizedSubmission = sanitizeSubmissionForStorage(submission, encryptedSubmissionOptions);
    if (sanitizedSubmission.isEncrypted) {
      assertEncryptedSubmissionLeakGuard(sanitizedSubmission, encryptedSubmissionOptions);
    }
    const { entry, manifest, form } = await loadManifestOrThrow(submission.formId);
    if (!entry?.manifestBlobId || !manifest) {
      if (sanitizedSubmission.isEncrypted) {
        assertEncryptedSubmissionLeakGuard(sanitizedSubmission, encryptedSubmissionOptions);
      }
      const { blobId, blobObjectId } = await uploadBody(
        new Blob([JSON.stringify(sanitizedSubmission)], { type: "application/json" }),
        "submission-bundle",
      );
      await localStorageAdapter.saveSubmission({
        ...sanitizedSubmission,
        blobId,
        ...(allowEmbeddedEncryptedPayload ? { encryptedBlobId: blobId } : {}),
      });
      upsertSubmissionBlobIndex({
        submissionId: sanitizedSubmission.id,
        formId: sanitizedSubmission.formId,
        blobId,
        blobObjectId,
        createdAt: sanitizedSubmission.createdAt,
      });
      return { id: sanitizedSubmission.id, blobId };
    }

    const existingSubmissionObjectIds = Object.fromEntries(
      listSubmissionBlobIndex(sanitizedSubmission.formId).map((item) => [item.submissionId, item.blobObjectId]),
    );
    const nextManifestEntries = [
      { submissionId: sanitizedSubmission.id, blobId: "", createdAt: sanitizedSubmission.createdAt },
      ...manifest.submissions.filter((item) => item.submissionId !== sanitizedSubmission.id),
    ];
    const nextManifest = createManifest(
      {
        id: manifest.formId,
        createdAt: manifest.createdAt,
        headerImage: form?.headerImage ?? manifest.headerImage,
        headerLogo: form?.headerLogo ?? manifest.headerLogo,
      },
      form ? bundledFormPointer : manifest.formBlobId,
      nextManifestEntries,
      new Date().toISOString(),
    );
    const bundle = await writeSubmissionBundle(sanitizedSubmission, nextManifest, form, encryptedSubmissionOptions);
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
    await localStorageAdapter.saveSubmission({
      ...sanitizedSubmission,
      blobId: bundle.blobId,
      ...(allowEmbeddedEncryptedPayload ? { encryptedBlobId: bundle.blobId } : {}),
    });
    if (!allowEmbeddedEncryptedPayload) {
      await cleanupSupersededWalrusObjects([
        entry.manifestBlobObjectId,
        form ? entry.formBlobObjectId : undefined,
      ], `saving submission ${sanitizedSubmission.id}`);
    }
    return { id: sanitizedSubmission.id, blobId: bundle.blobId };
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
      const { blobId, blobObjectId } = await uploadBody(
        new Blob([JSON.stringify(sanitizedSubmission)], { type: "application/json" }),
        "submission-bundle",
      );
      await localStorageAdapter.updateSubmission({ ...sanitizedSubmission, blobId });
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
    const existingSubmissionObjectIds = Object.fromEntries(
      existingSubmissionEntries.map((item) => [item.submissionId, item.blobObjectId]),
    );
    const existingCreatedAt =
      manifest.submissions.find((item) => item.submissionId === sanitizedSubmission.id)?.createdAt ??
      sanitizedSubmission.createdAt;
    const nextManifestEntries = [
      { submissionId: sanitizedSubmission.id, blobId: "", createdAt: existingCreatedAt },
      ...manifest.submissions.filter((item) => item.submissionId !== sanitizedSubmission.id),
    ];
    const nextManifest = createManifest(
      {
        id: manifest.formId,
        createdAt: manifest.createdAt,
        headerImage: form?.headerImage ?? manifest.headerImage,
        headerLogo: form?.headerLogo ?? manifest.headerLogo,
      },
      form ? bundledFormPointer : manifest.formBlobId,
      nextManifestEntries,
      new Date().toISOString(),
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
    await localStorageAdapter.updateSubmission({ ...sanitizedSubmission, blobId: bundle.blobId });
    await cleanupSupersededWalrusObjects([
      entry.manifestBlobObjectId,
      form ? entry.formBlobObjectId : undefined,
    ], `updating submission ${sanitizedSubmission.id}`);
  },

  async saveEncryptedPayload(payload) {
    const { blobId } = await uploadBody(new Blob([payload], { type: "text/plain" }), "encrypted-payload");
    return { blobId };
  },

  async readEncryptedPayload(blobId) {
    return fetchTextBlob(blobId);
  },

  async uploadFile(file) {
    const { blobId } = await uploadBody(file, "attachment");
    return {
      blobId,
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
