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
import type { FormSchema, SignalManifest, StorageAdapter, Submission } from "../types";

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
  submission: Submission;
  manifest: SignalManifest;
  form?: FormSchema;
};
type UploadResult = {
  blobId: string;
  blobObjectId?: string;
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

const publisherUrl = import.meta.env.VITE_WALRUS_PUBLISHER_URL?.replace(/\/$/, "");
const aggregatorUrl = WALRUS_AGGREGATOR_URL.replace(/\/$/, "");
const uploadRelayUrl = WALRUS_UPLOAD_RELAY_URL.replace(/\/$/, "");
const storageEpochs = Math.max(1, Number(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS || "5"));
const bundledFormPointer = "__bundled_form__";
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

export function setWalrusRuntimeContext(next: WalrusRuntimeContext) {
  runtimeContext = next;
}

function assertReadEnv() {
  if (!aggregatorUrl) {
    throw new Error("Walrus aggregator URL is not configured.");
  }
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
      const client = getWalrusClient();
      const signer = createWalletSigner();
      const owner = runtimeContext.account?.address;
      const result = await client.walrus.writeBlob({
        blob,
        signer,
        owner,
        epochs: storageEpochs,
        deletable: true,
        attributes: body.type ? { "content-type": body.type } : undefined,
      });
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
  try {
    const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Walrus fetch failed: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(logLabel, blobId, error);
    return null;
  }
}

async function fetchBlobFromWalrus(blobId: string): Promise<Blob | null> {
  if (!blobId.trim()) {
    return null;
  }
  assertReadEnv();
  try {
    const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Walrus fetch failed: ${response.status}`);
    }
    return await response.blob();
  } catch (error) {
    console.error("Walrus binary blob read failed", blobId, error);
    return null;
  }
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

async function fetchTextBlob(blobId: string): Promise<string | null> {
  if (!blobId.trim()) {
    return null;
  }
  return fetchBlobTextFromWalrus(blobId, "Walrus text blob read failed");
}

function createManifest(
  form: Pick<FormSchema, "id" | "createdAt">,
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
  const payload = await fetchJsonBlob<unknown>(blobId);
  return isFormBundle(payload) ? payload : null;
}

async function readSubmissionBundle(blobId: string): Promise<SubmissionBundle | null> {
  const payload = await fetchJsonBlob<unknown>(blobId);
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

  const manifest = await fetchJsonBlob<SignalManifest>(blobId);
  if (!manifest) {
    return null;
  }

  return {
    manifest,
    form: null as FormSchema | null,
  };
}

export async function readManifestWithForm(blobId: string): Promise<{
  manifest: SignalManifest;
  form: FormSchema | null;
} | null> {
  return readManifestCarrier(blobId);
}

function createSubmissionBundle(
  submission: Submission,
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

async function writeFormBundle(form: FormSchema, manifest: SignalManifest) {
  return uploadBody(
    new Blob([JSON.stringify(createFormBundle(form, manifest))], {
      type: "application/json",
    }),
    "form-bundle",
  );
}

async function writeSubmissionBundle(
  submission: Submission,
  manifest: SignalManifest,
  form?: FormSchema | null,
) {
  return uploadBody(
    new Blob([JSON.stringify(createSubmissionBundle(submission, manifest, form))], {
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
    return payload.submission;
  }
  if (isFormBundle(payload)) {
    return null;
  }
  return payload as Submission;
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
  const carrier = await readManifestWithForm(blobId);
  return carrier?.manifest ?? null;
}

export const walrusAdapter: StorageAdapter = {
  async saveForm(form: FormSchema) {
    const manifest = createManifest(form, bundledFormPointer, [], form.createdAt);
    const { blobId, blobObjectId } = await writeFormBundle(form, manifest);
    upsertFormBlobIndex({
      formId: form.id,
      formBlobId: blobId,
      formBlobObjectId: blobObjectId,
      manifestBlobId: blobId,
      manifestBlobObjectId: blobObjectId,
      createdAt: form.createdAt,
    });
    await localStorageAdapter.saveForm({ ...form, blobId, manifestBlobId: blobId });
    return { id: form.id, blobId, manifestBlobId: blobId };
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
    const forms = await Promise.all(
      entries.map(async (entry) => {
        if (entry.formBlobId === entry.manifestBlobId) {
          const carrier = await readManifestCarrier(entry.formBlobId);
          return carrier?.form ?? null;
        }
        return fetchJsonBlob<FormSchema>(entry.formBlobId);
      }),
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
    const { entry, manifest, form } = await loadManifestOrThrow(submission.formId);
    if (!entry?.manifestBlobId || !manifest) {
      const { blobId, blobObjectId } = await uploadBody(
        new Blob([JSON.stringify(submission)], { type: "application/json" }),
        "submission-bundle",
      );
      await localStorageAdapter.saveSubmission({ ...submission, blobId });
      upsertSubmissionBlobIndex({
        submissionId: submission.id,
        formId: submission.formId,
        blobId,
        blobObjectId,
        createdAt: submission.createdAt,
      });
      return { id: submission.id, blobId };
    }

    const existingSubmissionObjectIds = Object.fromEntries(
      listSubmissionBlobIndex(submission.formId).map((item) => [item.submissionId, item.blobObjectId]),
    );
    const nextManifestEntries = [
      { submissionId: submission.id, blobId: "", createdAt: submission.createdAt },
      ...manifest.submissions.filter((item) => item.submissionId !== submission.id),
    ];
    const nextManifest = createManifest(
      { id: manifest.formId, createdAt: manifest.createdAt },
      form ? bundledFormPointer : manifest.formBlobId,
      nextManifestEntries,
      new Date().toISOString(),
    );
    const bundle = await writeSubmissionBundle(submission, nextManifest, form);
    nextManifest.submissions[0].blobId = bundle.blobId;

    upsertFormBlobIndex({
      formId: submission.formId,
      formBlobId: form ? bundle.blobId : manifest.formBlobId,
      formBlobObjectId: form ? bundle.blobObjectId : entry.formBlobObjectId,
      manifestBlobId: bundle.blobId,
      manifestBlobObjectId: bundle.blobObjectId,
      createdAt: manifest.createdAt,
    });
    replaceSubmissionBlobIndex(
      submission.formId,
      nextManifest.submissions.map((manifestEntry) => ({
        submissionId: manifestEntry.submissionId,
        formId: submission.formId,
        blobId: manifestEntry.blobId,
        blobObjectId:
          manifestEntry.submissionId === submission.id
            ? bundle.blobObjectId
            : existingSubmissionObjectIds[manifestEntry.submissionId],
        createdAt: manifestEntry.createdAt,
      })),
    );
    await localStorageAdapter.saveSubmission({ ...submission, blobId: bundle.blobId });
    await cleanupSupersededWalrusObjects([
      entry.manifestBlobObjectId,
      form ? entry.formBlobObjectId : undefined,
    ], `saving submission ${submission.id}`);
    return { id: submission.id, blobId: bundle.blobId };
  },

  async listSubmissions(formId) {
    const manifestBlobId = getFormBlobIndex(formId)?.manifestBlobId;
    if (manifestBlobId) {
      const manifest = (await readManifestCarrier(manifestBlobId))?.manifest ?? null;
      if (manifest) {
        const submissions = await Promise.all(
          manifest.submissions.map((entry) => readSubmissionRecord(entry.blobId)),
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
    const submissions = await Promise.all(
      entries.map((entry) => readSubmissionRecord(entry.blobId)),
    );
    return submissions.reduce<Submission[]>((accumulator, submission, index) => {
      if (submission) {
        accumulator.push({ ...submission, blobId: entries[index].blobId });
      }
      return accumulator;
    }, []);
  },

  async updateSubmission(submission) {
    const { entry, manifest, form } = await loadManifestOrThrow(submission.formId);
    if (!entry?.manifestBlobId || !manifest) {
      const { blobId, blobObjectId } = await uploadBody(
        new Blob([JSON.stringify(submission)], { type: "application/json" }),
        "submission-bundle",
      );
      await localStorageAdapter.updateSubmission({ ...submission, blobId });
      upsertSubmissionBlobIndex({
        submissionId: submission.id,
        formId: submission.formId,
        blobId,
        blobObjectId,
        createdAt: submission.createdAt,
      });
      return;
    }

    const existingSubmissionEntries = listSubmissionBlobIndex(submission.formId);
    const existingSubmissionObjectIds = Object.fromEntries(
      existingSubmissionEntries.map((item) => [item.submissionId, item.blobObjectId]),
    );
    const existingCreatedAt =
      manifest.submissions.find((item) => item.submissionId === submission.id)?.createdAt ??
      submission.createdAt;
    const nextManifestEntries = [
      { submissionId: submission.id, blobId: "", createdAt: existingCreatedAt },
      ...manifest.submissions.filter((item) => item.submissionId !== submission.id),
    ];
    const nextManifest = createManifest(
      { id: manifest.formId, createdAt: manifest.createdAt },
      form ? bundledFormPointer : manifest.formBlobId,
      nextManifestEntries,
      new Date().toISOString(),
    );
    const bundle = await writeSubmissionBundle(submission, nextManifest, form);
    nextManifest.submissions[0].blobId = bundle.blobId;

    upsertFormBlobIndex({
      formId: submission.formId,
      formBlobId: form ? bundle.blobId : manifest.formBlobId,
      formBlobObjectId: form ? bundle.blobObjectId : entry.formBlobObjectId,
      manifestBlobId: bundle.blobId,
      manifestBlobObjectId: bundle.blobObjectId,
      createdAt: manifest.createdAt,
    });
    replaceSubmissionBlobIndex(
      submission.formId,
      nextManifest.submissions.map((manifestEntry) => ({
        submissionId: manifestEntry.submissionId,
        formId: submission.formId,
        blobId: manifestEntry.blobId,
        blobObjectId:
          manifestEntry.submissionId === submission.id
            ? bundle.blobObjectId
            : existingSubmissionObjectIds[manifestEntry.submissionId],
        createdAt: manifestEntry.createdAt,
      })),
    );
    await localStorageAdapter.updateSubmission({ ...submission, blobId: bundle.blobId });
    await cleanupSupersededWalrusObjects([
      entry.manifestBlobObjectId,
      form ? entry.formBlobObjectId : undefined,
    ], `updating submission ${submission.id}`);
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
