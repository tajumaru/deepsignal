interface FormBlobIndexEntry {
  formId: string;
  blobId: string;
  createdAt: string;
}

interface SubmissionBlobIndexEntry {
  submissionId: string;
  formId: string;
  blobId: string;
  createdAt: string;
}

interface BlobIndexStore {
  forms: FormBlobIndexEntry[];
  submissions: SubmissionBlobIndexEntry[];
}

const BLOB_INDEX_KEY = "deepsignal.walrus.index";

function readIndex(): BlobIndexStore {
  try {
    const raw = window.localStorage.getItem(BLOB_INDEX_KEY);
    if (!raw) {
      return { forms: [], submissions: [] };
    }
    const parsed = JSON.parse(raw) as Partial<BlobIndexStore>;
    return {
      forms: Array.isArray(parsed.forms) ? parsed.forms : [],
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
    };
  } catch {
    return { forms: [], submissions: [] };
  }
}

function writeIndex(store: BlobIndexStore) {
  window.localStorage.setItem(BLOB_INDEX_KEY, JSON.stringify(store));
}

export function upsertFormBlobIndex(entry: FormBlobIndexEntry) {
  const store = readIndex();
  store.forms = [entry, ...store.forms.filter((item) => item.formId !== entry.formId)];
  writeIndex(store);
}

export function listFormBlobIndex() {
  return readIndex().forms.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getFormBlobIndex(formId: string) {
  return readIndex().forms.find((item) => item.formId === formId) ?? null;
}

export function deleteFormBlobIndex(formId: string) {
  const store = readIndex();
  store.forms = store.forms.filter((item) => item.formId !== formId);
  store.submissions = store.submissions.filter((item) => item.formId !== formId);
  writeIndex(store);
}

export function upsertSubmissionBlobIndex(entry: SubmissionBlobIndexEntry) {
  const store = readIndex();
  store.submissions = [
    entry,
    ...store.submissions.filter((item) => item.submissionId !== entry.submissionId),
  ];
  writeIndex(store);
}

export function listSubmissionBlobIndex(formId: string) {
  return readIndex()
    .submissions.filter((item) => item.formId === formId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function deleteSubmissionBlobIndex(submissionId: string) {
  const store = readIndex();
  store.submissions = store.submissions.filter((item) => item.submissionId !== submissionId);
  writeIndex(store);
}
