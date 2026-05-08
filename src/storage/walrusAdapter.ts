import { fromBase64 } from "@mysten/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";
import { signTransaction, type WalletAccount, type WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import { StorageNodeAPIError, WalrusClientError, type WalrusClient } from "@mysten/walrus";
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
type UploadResult = {
  blobId: string;
  blobObjectId?: string;
};
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
    async signAndExecuteTransaction({ transaction, client: txClient }) {
      const activeClient = (txClient as WalrusEnabledClient | undefined) ?? client;
      transaction.setSenderIfNotSet(account.address);
      const { bytes, signature } = await signTransaction(wallet, {
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

      return activeClient.core.executeTransaction({
        transaction: fromBase64(bytes),
        signatures: [signature],
        include: {
          transaction: true,
          effects: true,
        },
      });
    },
  } as Signer;
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
  if (error instanceof Error) {
    const message = error.message;
    const lower = message.toLowerCase();

    if (
      lower.includes("insufficientgas") ||
      lower.includes("insufficientcoinbalance") ||
      lower.includes("insufficientbalanceforwithdraw")
    ) {
      return new Error(
        "Walrus storage transaction failed: wallet balance is insufficient for storage cost or gas.",
      );
    }

    if (error instanceof StorageNodeAPIError) {
      if (lower.includes("tip") && (lower.includes("max") || lower.includes("limit"))) {
        return new Error("Walrus upload relay failed: the required relay tip exceeded the configured tip max.");
      }
      return new Error(`Walrus upload relay failed: ${message}`);
    }

    if (lower.includes("failed to certify blob") || lower.includes("certify blob")) {
      return new Error(`Walrus certification failed: ${message}`);
    }

    if (lower.includes("tip") && (lower.includes("max") || lower.includes("limit"))) {
      return new Error("Walrus upload relay failed: the required relay tip exceeded the configured tip max.");
    }

    if (lower.includes("upload relay")) {
      return new Error(`Walrus upload relay failed: ${message}`);
    }

    if (error instanceof WalrusClientError) {
      return new Error(`Walrus storage transaction failed: ${message}`);
    }
  }

  return error instanceof Error ? error : new Error("Walrus upload failed.");
}

async function uploadBodyWithPublisher(body: Blob | File): Promise<UploadResult> {
  assertPublisherEnv();
  const response = await fetch(`${publisherUrl}/v1/blobs`, {
    method: "PUT",
    body,
  });
  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`Walrus upload failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return {
    blobId: extractBlobId(payload),
    blobObjectId: extractBlobObjectId(payload),
  };
}

async function uploadBodyWithSdk(body: Blob | File): Promise<UploadResult> {
  try {
    const client = getWalrusClient();
    const signer = createWalletSigner();
    const blob = new Uint8Array(await body.arrayBuffer());
    const owner = runtimeContext.account?.address;
    const result = await client.walrus.writeBlob({
      blob,
      signer,
      owner,
      epochs: storageEpochs,
      deletable: true,
      attributes: body.type ? { "content-type": body.type } : undefined,
    });
    return {
      blobId: result.blobId,
      blobObjectId: result.blobObject.id,
    };
  } catch (error) {
    throw normalizeWalrusWriteError(error);
  }
}

async function uploadBody(body: Blob | File): Promise<UploadResult> {
  if (walrusStorageMode === "publisher") {
    return uploadBodyWithPublisher(body);
  }
  return uploadBodyWithSdk(body);
}

async function deleteBlobObjectFromWalrus(blobObjectId?: string) {
  if (!blobObjectId) {
    return;
  }
  const client = getRuntimeWalrusClient();
  const signer = createWalletSigner();
  await client.walrus.executeDeleteBlobTransaction({ blobObjectId, signer });
}

async function deleteBlobObjectsFromWalrus(blobObjectIds: Array<string | undefined>) {
  const uniqueBlobObjectIds = [...new Set(blobObjectIds.filter((value): value is string => Boolean(value)))];
  for (const blobObjectId of uniqueBlobObjectIds) {
    await deleteBlobObjectFromWalrus(blobObjectId);
  }
}

function assertDeleteTargetsTracked(
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
  if (missingTrackedObjects.length > 0) {
    throw new Error(
      `Walrus deletion could not be verified for this node because ${missingTrackedObjects.join(
        ", ",
      )} blob object ids are missing. This data was likely saved before delete tracking was enabled.`,
    );
  }
}

export async function fetchJsonBlob<T>(blobId: string): Promise<T | null> {
  assertReadEnv();
  try {
    const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`);
    if (!response.ok) {
      throw new Error(`Walrus fetch failed: ${response.status}`);
    }
    const text = await response.text();
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Walrus blob read failed", blobId, error);
    return null;
  }
}

async function fetchTextBlob(blobId: string): Promise<string | null> {
  assertReadEnv();
  try {
    const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`);
    if (!response.ok) {
      throw new Error(`Walrus fetch failed: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error("Walrus text blob read failed", blobId, error);
    return null;
  }
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

async function writeFormBundle(form: FormSchema, manifest: SignalManifest) {
  return uploadBody(
    new Blob([JSON.stringify(createFormBundle(form, manifest))], {
      type: "application/json",
    }),
  );
}

async function loadManifestOrThrow(formId: string) {
  const entry = getFormBlobIndex(formId);
  if (!entry?.manifestBlobId) {
    return { entry, manifest: null as SignalManifest | null };
  }
  if (entry.formBlobId === entry.manifestBlobId) {
    const bundle = await readFormBundle(entry.manifestBlobId);
    if (!bundle) {
      throw new Error(`Unable to read bundled form blob for form ${formId}.`);
    }
    return {
      entry,
      manifest: bundle.manifest,
      form: bundle.form,
      bundledBlobId: entry.manifestBlobId,
    };
  }
  const manifest = await readManifest(entry.manifestBlobId);
  if (!manifest) {
    throw new Error(`Unable to read manifest blob for form ${formId}.`);
  }
  return { entry, manifest, form: null as FormSchema | null, bundledBlobId: null as string | null };
}

async function writeManifestAndPointers(
  formId: string,
  manifest: SignalManifest,
  formBlobId: string,
  submissionBlobObjectIds: Record<string, string | undefined>,
  form?: FormSchema | null,
) {
  let manifestBlobId: string;
  let manifestBlobObjectId: string | undefined;
  let nextFormBlobId = formBlobId;
  let nextFormBlobObjectId: string | undefined;
  if (form) {
    const bundle = await writeFormBundle(
      {
        ...form,
        blobId: undefined,
        manifestBlobId: undefined,
      },
      manifest,
    );
    manifestBlobId = bundle.blobId;
    manifestBlobObjectId = bundle.blobObjectId;
    nextFormBlobId = bundle.blobId;
    nextFormBlobObjectId = bundle.blobObjectId;
  } else {
    const savedManifest = await saveManifest(manifest);
    manifestBlobId = savedManifest.blobId;
    manifestBlobObjectId = savedManifest.blobObjectId;
  }
  upsertFormBlobIndex({
    formId,
    formBlobId: nextFormBlobId,
    formBlobObjectId: nextFormBlobObjectId,
    manifestBlobId,
    manifestBlobObjectId,
    createdAt: manifest.createdAt,
  });
  replaceSubmissionBlobIndex(
    formId,
    manifest.submissions.map((submission) => ({
      submissionId: submission.submissionId,
      formId,
      blobId: submission.blobId,
      blobObjectId: submissionBlobObjectIds[submission.submissionId],
      createdAt: submission.createdAt,
    })),
  );
  return { manifestBlobId, manifestBlobObjectId, formBlobId: nextFormBlobId, formBlobObjectId: nextFormBlobObjectId };
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
  );
}

export async function readManifest(blobId: string): Promise<SignalManifest | null> {
  return fetchJsonBlob<SignalManifest>(blobId);
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
      const bundle = await readFormBundle(index.formBlobId);
      return bundle
        ? {
            ...bundle.form,
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
          const bundle = await readFormBundle(entry.formBlobId);
          return bundle?.form ?? null;
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
    const formEntry = getFormBlobIndex(id);
    const submissionEntries = listSubmissionBlobIndex(id);
    assertDeleteTargetsTracked(formEntry, submissionEntries);
    await deleteBlobObjectsFromWalrus([
      formEntry?.formBlobObjectId,
      formEntry?.manifestBlobObjectId,
      ...submissionEntries.map((entry) => entry.blobObjectId),
    ]);
    deleteFormBlobIndex(id);
  },

  async saveSubmission(submission: Submission) {
    const { blobId, blobObjectId } = await uploadBody(
      new Blob([JSON.stringify(submission)], { type: "application/json" }),
    );
    await localStorageAdapter.saveSubmission({ ...submission, blobId });

    const { entry, manifest, form } = await loadManifestOrThrow(submission.formId);
    if (!entry?.manifestBlobId || !manifest) {
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
    const nextManifest = createManifest(
      { id: manifest.formId, createdAt: manifest.createdAt },
      form ? bundledFormPointer : manifest.formBlobId,
      [
        { submissionId: submission.id, blobId, createdAt: submission.createdAt },
        ...manifest.submissions.filter((item) => item.submissionId !== submission.id),
      ],
      new Date().toISOString(),
    );
    const replacedFormObjectId =
      entry.formBlobId === entry.manifestBlobId ? entry.formBlobObjectId : undefined;
    await writeManifestAndPointers(
      submission.formId,
      nextManifest,
      manifest.formBlobId,
      {
        ...existingSubmissionObjectIds,
        [submission.id]: blobObjectId,
      },
      form,
    );
    await deleteBlobObjectsFromWalrus([entry.manifestBlobObjectId, replacedFormObjectId]);
    return { id: submission.id, blobId };
  },

  async listSubmissions(formId) {
    const manifestBlobId = getFormBlobIndex(formId)?.manifestBlobId;
    if (manifestBlobId) {
      const formEntry = getFormBlobIndex(formId);
      const manifest =
        formEntry?.formBlobId === manifestBlobId
          ? (await readFormBundle(manifestBlobId))?.manifest ?? null
          : await readManifest(manifestBlobId);
      if (manifest) {
        const submissions = await Promise.all(
          manifest.submissions.map((entry) => fetchJsonBlob<Submission>(entry.blobId)),
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
      entries.map((entry) => fetchJsonBlob<Submission>(entry.blobId)),
    );
    return submissions.reduce<Submission[]>((accumulator, submission, index) => {
      if (submission) {
        accumulator.push({ ...submission, blobId: entries[index].blobId });
      }
      return accumulator;
    }, []);
  },

  async updateSubmission(submission) {
    const { blobId, blobObjectId } = await uploadBody(
      new Blob([JSON.stringify(submission)], { type: "application/json" }),
    );
    await localStorageAdapter.updateSubmission({ ...submission, blobId });

    const { entry, manifest, form } = await loadManifestOrThrow(submission.formId);
    if (!entry?.manifestBlobId || !manifest) {
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
    const replacedSubmissionObjectId = existingSubmissionEntries.find(
      (item) => item.submissionId === submission.id,
    )?.blobObjectId;
    const existingCreatedAt =
      manifest.submissions.find((item) => item.submissionId === submission.id)?.createdAt ??
      submission.createdAt;
    const nextManifest = createManifest(
      { id: manifest.formId, createdAt: manifest.createdAt },
      form ? bundledFormPointer : manifest.formBlobId,
      [
        { submissionId: submission.id, blobId, createdAt: existingCreatedAt },
        ...manifest.submissions.filter((item) => item.submissionId !== submission.id),
      ],
      new Date().toISOString(),
    );
    const replacedFormObjectId =
      entry.formBlobId === entry.manifestBlobId ? entry.formBlobObjectId : undefined;
    await writeManifestAndPointers(
      submission.formId,
      nextManifest,
      manifest.formBlobId,
      {
        ...existingSubmissionObjectIds,
        [submission.id]: blobObjectId,
      },
      form,
    );
    await deleteBlobObjectsFromWalrus([
      replacedSubmissionObjectId,
      entry.manifestBlobObjectId,
      replacedFormObjectId,
    ]);
  },

  async saveEncryptedPayload(payload) {
    const { blobId } = await uploadBody(new Blob([payload], { type: "text/plain" }));
    return { blobId };
  },

  async readEncryptedPayload(blobId) {
    return fetchTextBlob(blobId);
  },

  async uploadFile(file) {
    const { blobId } = await uploadBody(file);
    return {
      blobId,
      url: getWalrusBlobUrl(blobId) ?? undefined,
    };
  },
};
