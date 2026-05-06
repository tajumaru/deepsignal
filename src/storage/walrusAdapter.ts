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
import type { FormSchema, SignalManifest, StorageAdapter, Submission } from "../types";

const publisherUrl = import.meta.env.VITE_WALRUS_PUBLISHER_URL?.replace(/\/$/, "");
const aggregatorUrl = import.meta.env.VITE_WALRUS_AGGREGATOR_URL?.replace(/\/$/, "");

function assertWalrusEnv() {
  if (!publisherUrl || !aggregatorUrl) {
    throw new Error("Walrus publisher or aggregator URL is not configured.");
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

async function uploadBody(body: Blob | File) {
  assertWalrusEnv();
  const response = await fetch(`${publisherUrl}/v1/blobs`, {
    method: "PUT",
    body,
  });
  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`Walrus upload failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return extractBlobId(payload);
}

export async function fetchJsonBlob<T>(blobId: string): Promise<T | null> {
  assertWalrusEnv();
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
  assertWalrusEnv();
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

async function loadManifestOrThrow(formId: string) {
  const entry = getFormBlobIndex(formId);
  if (!entry?.manifestBlobId) {
    return { entry, manifest: null as SignalManifest | null };
  }
  const manifest = await readManifest(entry.manifestBlobId);
  if (!manifest) {
    throw new Error(`Unable to read manifest blob for form ${formId}.`);
  }
  return { entry, manifest };
}

async function writeManifestAndPointers(
  formId: string,
  manifest: SignalManifest,
  formBlobId: string,
) {
  const { blobId: manifestBlobId } = await saveManifest(manifest);
  upsertFormBlobIndex({
    formId,
    formBlobId,
    manifestBlobId,
    createdAt: manifest.createdAt,
  });
  replaceSubmissionBlobIndex(
    formId,
    manifest.submissions.map((submission) => ({
      submissionId: submission.submissionId,
      formId,
      blobId: submission.blobId,
      createdAt: submission.createdAt,
    })),
  );
  return manifestBlobId;
}

export function getWalrusBlobUrl(blobId: string) {
  if (!aggregatorUrl) {
    return null;
  }
  return `${aggregatorUrl}/v1/blobs/${blobId}`;
}

export async function saveManifest(manifest: SignalManifest): Promise<{ blobId: string }> {
  const blobId = await uploadBody(
    new Blob([JSON.stringify(manifest)], { type: "application/json" }),
  );
  return { blobId };
}

export async function readManifest(blobId: string): Promise<SignalManifest | null> {
  return fetchJsonBlob<SignalManifest>(blobId);
}

export const walrusAdapter: StorageAdapter = {
  async saveForm(form: FormSchema) {
    const formBlobId = await uploadBody(
      new Blob([JSON.stringify(form)], { type: "application/json" }),
    );
    const initialManifest = createManifest(form, formBlobId, [], form.createdAt);
    const manifestBlobId = await writeManifestAndPointers(form.id, initialManifest, formBlobId);
    await localStorageAdapter.saveForm({ ...form, blobId: formBlobId, manifestBlobId });
    return { id: form.id, blobId: formBlobId, manifestBlobId };
  },

  async getForm(id) {
    const index = getFormBlobIndex(id);
    if (!index) {
      return null;
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
    const forms = await Promise.all(entries.map((entry) => fetchJsonBlob<FormSchema>(entry.formBlobId)));
    return forms.reduce<FormSchema[]>((accumulator, form, index) => {
      if (form) {
        accumulator.push({
          ...form,
          blobId: entries[index].formBlobId,
          manifestBlobId: entries[index].manifestBlobId,
        });
      }
      return accumulator;
    }, []);
  },

  async deleteForm(id) {
    deleteFormBlobIndex(id);
  },

  async saveSubmission(submission: Submission) {
    const blobId = await uploadBody(
      new Blob([JSON.stringify(submission)], { type: "application/json" }),
    );
    await localStorageAdapter.saveSubmission({ ...submission, blobId });

    const { entry, manifest } = await loadManifestOrThrow(submission.formId);
    if (!entry?.manifestBlobId || !manifest) {
      upsertSubmissionBlobIndex({
        submissionId: submission.id,
        formId: submission.formId,
        blobId,
        createdAt: submission.createdAt,
      });
      return { id: submission.id, blobId };
    }

    const nextManifest = createManifest(
      { id: manifest.formId, createdAt: manifest.createdAt },
      manifest.formBlobId,
      [
        { submissionId: submission.id, blobId, createdAt: submission.createdAt },
        ...manifest.submissions.filter((item) => item.submissionId !== submission.id),
      ],
      new Date().toISOString(),
    );
    await writeManifestAndPointers(submission.formId, nextManifest, manifest.formBlobId);
    return { id: submission.id, blobId };
  },

  async listSubmissions(formId) {
    const manifestBlobId = getFormBlobIndex(formId)?.manifestBlobId;
    if (manifestBlobId) {
      const manifest = await readManifest(manifestBlobId);
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
    const blobId = await uploadBody(
      new Blob([JSON.stringify(submission)], { type: "application/json" }),
    );
    await localStorageAdapter.updateSubmission({ ...submission, blobId });

    const { entry, manifest } = await loadManifestOrThrow(submission.formId);
    if (!entry?.manifestBlobId || !manifest) {
      upsertSubmissionBlobIndex({
        submissionId: submission.id,
        formId: submission.formId,
        blobId,
        createdAt: submission.createdAt,
      });
      return;
    }

    const existingCreatedAt =
      manifest.submissions.find((item) => item.submissionId === submission.id)?.createdAt ??
      submission.createdAt;
    const nextManifest = createManifest(
      { id: manifest.formId, createdAt: manifest.createdAt },
      manifest.formBlobId,
      [
        { submissionId: submission.id, blobId, createdAt: existingCreatedAt },
        ...manifest.submissions.filter((item) => item.submissionId !== submission.id),
      ],
      new Date().toISOString(),
    );
    await writeManifestAndPointers(submission.formId, nextManifest, manifest.formBlobId);
  },

  async saveEncryptedPayload(payload) {
    const blobId = await uploadBody(new Blob([payload], { type: "text/plain" }));
    return { blobId };
  },

  async readEncryptedPayload(blobId) {
    return fetchTextBlob(blobId);
  },

  async uploadFile(file) {
    const blobId = await uploadBody(file);
    return {
      blobId,
      url: getWalrusBlobUrl(blobId) ?? undefined,
    };
  },
};
