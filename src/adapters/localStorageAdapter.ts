import type { FormSchema, StorageAdapter, Submission } from "../types";

const FORMS_KEY = "deepsignal.forms";
const SUBMISSIONS_KEY = "deepsignal.submissions";
const FILES_KEY = "deepsignal.files";
const ENCRYPTED_PAYLOADS_KEY = "deepsignal.encryptedPayloads";

interface StoredFileRecord {
  blobId: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

interface StoredEncryptedPayload {
  blobId: string;
  payload: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export const localStorageAdapter: StorageAdapter = {
  async saveForm(form) {
    const forms = readJson<FormSchema[]>(FORMS_KEY, []);
    const nextForms = forms.filter((item) => item.id !== form.id);
    const blobId = form.blobId ?? `walrus-form-${form.id}`;
    nextForms.unshift({ ...form, blobId });
    writeJson(FORMS_KEY, nextForms);
    return { id: form.id, blobId, manifestBlobId: form.manifestBlobId };
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
    const nextSubmissions = submissions.filter((item) => item.id !== submission.id);
    const blobId = submission.blobId ?? `walrus-submission-${submission.id}`;
    nextSubmissions.unshift({ ...submission, blobId });
    writeJson(SUBMISSIONS_KEY, nextSubmissions);
    return { id: submission.id, blobId };
  },

  async listSubmissions(formId) {
    const submissions = readJson<Submission[]>(SUBMISSIONS_KEY, []);
    return submissions
      .filter((submission) => submission.formId === formId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async updateSubmission(submission) {
    const submissions = readJson<Submission[]>(SUBMISSIONS_KEY, []);
    const nextSubmissions = submissions.map((item) =>
      item.id === submission.id ? submission : item,
    );
    writeJson(SUBMISSIONS_KEY, nextSubmissions);
  },

  async saveEncryptedPayload(payload) {
    const encryptedPayloads = readJson<StoredEncryptedPayload[]>(ENCRYPTED_PAYLOADS_KEY, []);
    const blobId = `walrus-sealed-${crypto.randomUUID()}`;
    encryptedPayloads.unshift({ blobId, payload });
    writeJson(ENCRYPTED_PAYLOADS_KEY, encryptedPayloads);
    return { blobId };
  },

  async readEncryptedPayload(blobId) {
    const encryptedPayloads = readJson<StoredEncryptedPayload[]>(ENCRYPTED_PAYLOADS_KEY, []);
    return encryptedPayloads.find((item) => item.blobId === blobId)?.payload ?? null;
  },

  async uploadFile(file) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const files = readJson<StoredFileRecord[]>(FILES_KEY, []);
    const blobId = `walrus-file-${crypto.randomUUID()}`;
    files.unshift({
      blobId,
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl,
    });
    writeJson(FILES_KEY, files);
    return { blobId, url: dataUrl };
  },
};
