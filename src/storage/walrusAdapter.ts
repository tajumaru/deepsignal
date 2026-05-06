import {
  deleteFormBlobIndex,
  getFormBlobIndex,
  listFormBlobIndex,
  listSubmissionBlobIndex,
  upsertFormBlobIndex,
  upsertSubmissionBlobIndex,
} from "./blobIndex";
import type { FormSchema, StorageAdapter, Submission } from "../types";

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

async function fetchJsonBlob<T>(blobId: string): Promise<T | null> {
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

export function getWalrusBlobUrl(blobId: string) {
  if (!aggregatorUrl) {
    return null;
  }
  return `${aggregatorUrl}/v1/blobs/${blobId}`;
}

export const walrusAdapter: StorageAdapter = {
  async saveForm(form: FormSchema) {
    const blobId = await uploadBody(
      new Blob([JSON.stringify(form)], { type: "application/json" }),
    );
    upsertFormBlobIndex({ formId: form.id, blobId, createdAt: form.createdAt });
    return { id: form.id, blobId };
  },

  async getForm(id) {
    const index = getFormBlobIndex(id);
    if (!index) {
      return null;
    }
    const form = await fetchJsonBlob<FormSchema>(index.blobId);
    return form ? { ...form, blobId: index.blobId } : null;
  },

  async listForms() {
    const entries = listFormBlobIndex();
    const forms = await Promise.all(entries.map((entry) => fetchJsonBlob<FormSchema>(entry.blobId)));
    return forms.reduce<FormSchema[]>((accumulator, form, index) => {
      if (form) {
        accumulator.push({ ...form, blobId: entries[index].blobId });
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
    upsertSubmissionBlobIndex({
      submissionId: submission.id,
      formId: submission.formId,
      blobId,
      createdAt: submission.createdAt,
    });
    return { id: submission.id, blobId };
  },

  async listSubmissions(formId) {
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
    upsertSubmissionBlobIndex({
      submissionId: submission.id,
      formId: submission.formId,
      blobId,
      createdAt: submission.createdAt,
    });
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
