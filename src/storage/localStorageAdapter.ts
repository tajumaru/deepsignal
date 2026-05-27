import type { FormSchema, StorageAdapter, Submission } from "../types";
import { assertEncryptedSubmissionLeakGuard, sanitizeSubmissionForStorage } from "./submissionSanitizer";

const FORMS_KEY = "deepsignal.forms";
const SUBMISSIONS_KEY = "deepsignal.submissions";
const ENCRYPTED_PAYLOADS_KEY = "deepsignal.encryptedPayloads";
const CORRUPTED_STORAGE_PREFIX = "deepsignal.corrupted";

interface StoredFileRecord {
  blobId: string;
  name: string;
  size: number;
  type: string;
}

interface StoredEncryptedPayloadRecord {
  blobId: string;
  payload: string;
}

const transientFiles = new Map<string, Blob>();
const transientEncryptedPayloads = new Map<string, string>();

function isDurableBlobId(blobId: string | undefined) {
  return Boolean(blobId && !blobId.startsWith("local-") && !blobId.startsWith("inline:"));
}

function matchesRegisteredForm(form: FormSchema, registeredForm: FormSchema) {
  if (form.id === registeredForm.id) {
    return true;
  }
  if (form.projectId && registeredForm.projectId && form.projectId !== registeredForm.projectId) {
    return false;
  }
  if (
    isDurableBlobId(form.manifestBlobId) &&
    isDurableBlobId(registeredForm.manifestBlobId) &&
    form.manifestBlobId === registeredForm.manifestBlobId
  ) {
    return true;
  }
  return (
    isDurableBlobId(form.blobId) &&
    isDurableBlobId(registeredForm.blobId) &&
    form.blobId === registeredForm.blobId
  );
}

function matchesRegisteredSubmission(submission: Submission, registeredSubmission: Submission) {
  if (submission.id === registeredSubmission.id) {
    return true;
  }
  if (submission.formId !== registeredSubmission.formId) {
    return false;
  }
  if (
    typeof submission.onchainSignalId === "number" &&
    typeof registeredSubmission.onchainSignalId === "number" &&
    submission.onchainSignalId === registeredSubmission.onchainSignalId
  ) {
    return true;
  }
  if (
    isDurableBlobId(submission.receiptBlobId) &&
    isDurableBlobId(registeredSubmission.receiptBlobId) &&
    submission.receiptBlobId === registeredSubmission.receiptBlobId
  ) {
    return true;
  }
  return Boolean(
    submission.signalReceiptMetadataDigest &&
      registeredSubmission.signalReceiptMetadataDigest &&
      submission.signalReceiptMetadataDigest === registeredSubmission.signalReceiptMetadataDigest,
  );
}

function upsertRegisteredSubmission(submissions: Submission[], registeredSubmission: Submission) {
  const nextSubmissions = submissions.filter((submission) => !matchesRegisteredSubmission(submission, registeredSubmission));
  return [registeredSubmission, ...nextSubmissions];
}

function findStoredFile(blobId: string) {
  return transientFiles.get(blobId) ?? null;
}

function quarantineCorruptedStorageValue(key: string, raw: string, error: unknown) {
  try {
    const stamp = new Date().toISOString();
    window.localStorage.setItem(
      `${CORRUPTED_STORAGE_PREFIX}.${key}.${stamp}`,
      JSON.stringify({
        key,
        raw,
        quarantinedAt: stamp,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    window.localStorage.removeItem(key);
  } catch (quarantineError) {
    console.warn("Failed to quarantine corrupted local storage state.", quarantineError);
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        quarantineCorruptedStorageValue(key, raw, error);
      }
    } catch {
      // Some mobile privacy modes can throw on localStorage access itself.
    }
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getEncryptedSubmissionOptions() {
  return {
    allowEncryptedPayload: false,
  };
}

export const localStorageAdapter: StorageAdapter = {
  async saveForm(form) {
    const forms = readJson<FormSchema[]>(FORMS_KEY, []);
    const nextForms = forms.filter((item) => item.id !== form.id);
    const blobId = form.blobId ?? `local-form-${form.id}`;
    nextForms.unshift({ ...form, blobId });
    writeJson(FORMS_KEY, nextForms);
    return { id: form.id, blobId, manifestBlobId: form.manifestBlobId, tatumStorage: form.tatumStorage };
  },

  async getForm(id) {
    const forms = readJson<FormSchema[]>(FORMS_KEY, []);
    return forms.find((form) => form.id === id) ?? null;
  },

  async listForms() {
    return readJson<FormSchema[]>(FORMS_KEY, []);
  },

  async deleteForm(id) {
    await this.deleteForms([id]);
  },

  async deleteForms(ids) {
    const targetIds = new Set(ids);
    if (targetIds.size === 0) {
      return;
    }
    const forms = readJson<FormSchema[]>(FORMS_KEY, []);
    const submissions = readJson<Submission[]>(SUBMISSIONS_KEY, []);
    writeJson(
      FORMS_KEY,
      forms.filter((form) => !targetIds.has(form.id)),
    );
    writeJson(
      SUBMISSIONS_KEY,
      submissions.filter((submission) => !targetIds.has(submission.formId)),
    );
  },

  async saveSubmission(submission) {
    const submissions = readJson<Submission[]>(SUBMISSIONS_KEY, []);
    const encryptedSubmissionOptions = getEncryptedSubmissionOptions();
    const sanitizedSubmission = sanitizeSubmissionForStorage(submission, encryptedSubmissionOptions);
    if (sanitizedSubmission.isEncrypted) {
      assertEncryptedSubmissionLeakGuard(sanitizedSubmission, encryptedSubmissionOptions);
    }
    const nextSubmissions = submissions.filter((item) => item.id !== sanitizedSubmission.id);
    const blobId = sanitizedSubmission.blobId ?? `local-submission-${sanitizedSubmission.id}`;
    const storedSubmission = {
      ...sanitizedSubmission,
      blobId,
      answerBlobId: sanitizedSubmission.answerBlobId ?? blobId,
      remoteIndexUpdated: sanitizedSubmission.remoteIndexUpdated ?? false,
      remoteIndexReadBack: sanitizedSubmission.remoteIndexReadBack ?? false,
      ownerReadable: sanitizedSubmission.ownerReadable ?? false,
      remoteSyncStatus: sanitizedSubmission.remoteSyncStatus ?? "local_only",
    } satisfies Submission;
    nextSubmissions.unshift(storedSubmission);
    writeJson(SUBMISSIONS_KEY, nextSubmissions);
    return {
      id: sanitizedSubmission.id,
      blobId,
      answerBlobId: storedSubmission.answerBlobId,
      remoteIndexUpdated: storedSubmission.remoteIndexUpdated,
      remoteIndexReadBack: storedSubmission.remoteIndexReadBack,
      ownerReadable: storedSubmission.ownerReadable,
      remoteSyncStatus: storedSubmission.remoteSyncStatus,
      tatumStorage: sanitizedSubmission.tatumStorage,
    };
  },

  async listSubmissions(formId) {
    const submissions = readJson<Submission[]>(SUBMISSIONS_KEY, []);
    return submissions
      .filter((submission) => submission.formId === formId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async updateSubmission(submission) {
    const submissions = readJson<Submission[]>(SUBMISSIONS_KEY, []);
    const encryptedSubmissionOptions = getEncryptedSubmissionOptions();
    const sanitizedSubmission = sanitizeSubmissionForStorage(submission, encryptedSubmissionOptions);
    if (sanitizedSubmission.isEncrypted) {
      assertEncryptedSubmissionLeakGuard(sanitizedSubmission, encryptedSubmissionOptions);
    }
    const nextSubmissions = submissions.map((item) =>
      item.id === sanitizedSubmission.id ? sanitizedSubmission : item,
    );
    writeJson(SUBMISSIONS_KEY, nextSubmissions);
  },

  async saveEncryptedPayload(payload) {
    const blobId = `local-sealed-transient-${crypto.randomUUID()}`;
    transientEncryptedPayloads.set(blobId, payload);
    const encryptedPayloads = readJson<StoredEncryptedPayloadRecord[]>(ENCRYPTED_PAYLOADS_KEY, []);
    writeJson(
      ENCRYPTED_PAYLOADS_KEY,
      [{ blobId, payload }, ...encryptedPayloads.filter((item) => item.blobId !== blobId)],
    );
    return { blobId };
  },

  async readEncryptedPayload(blobId) {
    const transientPayload = transientEncryptedPayloads.get(blobId);
    if (transientPayload) {
      return transientPayload;
    }
    const encryptedPayloads = readJson<StoredEncryptedPayloadRecord[]>(ENCRYPTED_PAYLOADS_KEY, []);
    return encryptedPayloads.find((item) => item.blobId === blobId)?.payload ?? null;
  },

  async uploadFile(file) {
    const blobId = `local-file-transient-${crypto.randomUUID()}`;
    const record: StoredFileRecord = {
      blobId,
      name: file.name,
      size: file.size,
      type: file.type,
    };
    transientFiles.set(blobId, file);
    console.info("[local storage adapter] attachment kept in memory only", record);
    return { blobId };
  },

  async readFileBlob(blobId) {
    return findStoredFile(blobId);
  },

  async readFileText(blobId) {
    const blob = await this.readFileBlob(blobId);
    return blob ? blob.text() : null;
  },
};

export async function cleanupRegisteredFormLocalFallback(registeredForm: FormSchema) {
  const forms = readJson<FormSchema[]>(FORMS_KEY, []);
  const nextForms = forms.filter((form) => !matchesRegisteredForm(form, registeredForm));
  writeJson(FORMS_KEY, [registeredForm, ...nextForms]);
}

export async function cleanupRegisteredSubmissionLocalFallback(registeredSubmission: Submission) {
  const encryptedSubmissionOptions = getEncryptedSubmissionOptions();
  const sanitizedSubmission = sanitizeSubmissionForStorage(registeredSubmission, encryptedSubmissionOptions);
  if (sanitizedSubmission.isEncrypted) {
    assertEncryptedSubmissionLeakGuard(sanitizedSubmission, encryptedSubmissionOptions);
  }
  const submissions = readJson<Submission[]>(SUBMISSIONS_KEY, []);
  writeJson(SUBMISSIONS_KEY, upsertRegisteredSubmission(submissions, sanitizedSubmission));
}
