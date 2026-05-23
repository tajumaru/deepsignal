import type { FormSchema, Submission } from "../types";

const FORMS_KEY = "deepsignal.forms";
const SUBMISSIONS_KEY = "deepsignal.submissions";
const BLOB_INDEX_KEY = "deepsignal.walrus.index";
const FORM_METADATA_OVERLAY_KEY = "deepsignal.formMetadataOverlays";

type BlobIndexStore = {
  forms?: Array<{
    formId?: string;
    blobId?: string;
    formBlobId?: string;
    manifestBlobId?: string;
  }>;
  submissions?: Array<{
    submissionId?: string;
    formId?: string;
    blobId?: string;
  }>;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function forcePurgeFormArtifacts(args: {
  formIds: string[];
  manifestBlobIds?: string[];
  blobIds?: string[];
}) {
  const formIds = new Set(args.formIds);
  const manifestBlobIds = new Set(args.manifestBlobIds ?? []);
  const blobIds = new Set(args.blobIds ?? []);

  const forms = readJson<FormSchema[]>(FORMS_KEY, []);
  const removedFormIdsFromForms = new Set(
    forms
      .filter(
        (form) =>
          formIds.has(form.id) ||
          (form.manifestBlobId ? manifestBlobIds.has(form.manifestBlobId) : false) ||
          (form.blobId ? blobIds.has(form.blobId) : false),
      )
      .map((form) => form.id),
  );
  writeJson(
    FORMS_KEY,
    forms.filter((form) => !removedFormIdsFromForms.has(form.id)),
  );

  const overlays = readJson<Record<string, Partial<FormSchema>>>(FORM_METADATA_OVERLAY_KEY, {});
  Object.keys(overlays).forEach((formId) => {
    const overlay = overlays[formId];
    if (
      formIds.has(formId) ||
      removedFormIdsFromForms.has(formId) ||
      (typeof overlay.manifestBlobId === "string" && manifestBlobIds.has(overlay.manifestBlobId)) ||
      (typeof overlay.blobId === "string" && blobIds.has(overlay.blobId))
    ) {
      delete overlays[formId];
    }
  });
  writeJson(FORM_METADATA_OVERLAY_KEY, overlays);

  const blobIndex = readJson<BlobIndexStore>(BLOB_INDEX_KEY, {});
  const removedFormIdsFromBlobIndex = new Set(
    (blobIndex.forms ?? [])
      .filter(
        (entry) =>
          (entry.formId ? formIds.has(entry.formId) || removedFormIdsFromForms.has(entry.formId) : false) ||
          (entry.manifestBlobId ? manifestBlobIds.has(entry.manifestBlobId) : false) ||
          (entry.formBlobId ? blobIds.has(entry.formBlobId) : false) ||
          (entry.blobId ? blobIds.has(entry.blobId) : false),
      )
      .map((entry) => entry.formId)
      .filter((entry): entry is string => typeof entry === "string"),
  );
  blobIndex.forms = (blobIndex.forms ?? []).filter(
    (entry) => !(entry.formId && removedFormIdsFromBlobIndex.has(entry.formId)),
  );
  const removedFormIds = new Set([...formIds, ...removedFormIdsFromForms, ...removedFormIdsFromBlobIndex]);
  blobIndex.submissions = (blobIndex.submissions ?? []).filter(
    (entry) => !(entry.formId && removedFormIds.has(entry.formId)),
  );
  writeJson(BLOB_INDEX_KEY, blobIndex);

  const submissions = readJson<Submission[]>(SUBMISSIONS_KEY, []);
  writeJson(
    SUBMISSIONS_KEY,
    submissions.filter((submission) => !removedFormIds.has(submission.formId)),
  );
}
