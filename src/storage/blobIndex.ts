interface FormBlobIndexEntry {
  formId: string;
  formBlobId: string;
  manifestBlobId?: string;
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

type LegacyBlobIndexStore = {
  forms?: Array<{
    formId?: string;
    blobId?: string;
    formBlobId?: string;
    manifestBlobId?: string;
    createdAt?: string;
  }>;
  submissions?: Array<{
    submissionId?: string;
    formId?: string;
    blobId?: string;
    createdAt?: string;
  }>;
};

function readIndex(): BlobIndexStore {
  try {
    const raw = window.localStorage.getItem(BLOB_INDEX_KEY);
    if (!raw) {
      return { forms: [], submissions: [] };
    }
    const parsed = JSON.parse(raw) as LegacyBlobIndexStore;
    return {
      forms: Array.isArray(parsed.forms)
        ? parsed.forms.flatMap((entry) => {
            if (!entry?.formId || !(entry.formBlobId ?? entry.blobId) || !entry.createdAt) {
              return [];
            }
            return [
              {
                formId: entry.formId,
                formBlobId: entry.formBlobId ?? entry.blobId ?? "",
                manifestBlobId: entry.manifestBlobId,
                createdAt: entry.createdAt,
              },
            ];
          })
        : [],
      submissions: Array.isArray(parsed.submissions)
        ? parsed.submissions.flatMap((entry) => {
            if (!entry?.submissionId || !entry.formId || !entry.blobId || !entry.createdAt) {
              return [];
            }
            return [
              {
                submissionId: entry.submissionId,
                formId: entry.formId,
                blobId: entry.blobId,
                createdAt: entry.createdAt,
              },
            ];
          })
        : [],
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

export function getManifestBlobId(formId: string) {
  return getFormBlobIndex(formId)?.manifestBlobId ?? null;
}

export function updateManifestBlobPointer(formId: string, manifestBlobId: string) {
  const store = readIndex();
  const current = store.forms.find((item) => item.formId === formId);
  if (!current) {
    return;
  }
  store.forms = [
    { ...current, manifestBlobId },
    ...store.forms.filter((item) => item.formId !== formId),
  ];
  writeIndex(store);
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

export function replaceSubmissionBlobIndex(formId: string, entries: SubmissionBlobIndexEntry[]) {
  const store = readIndex();
  store.submissions = [
    ...entries,
    ...store.submissions.filter((item) => item.formId !== formId),
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
