import type { FormSchema } from "../types";

const DELETED_FORM_TOMBSTONES_KEY = "deepsignal.deletedFormTombstones";

type DeletedFormTombstones = {
  formIds: string[];
  manifestBlobIds: string[];
  blobIds: string[];
  projectFormKeys: string[];
};

function readDeletedFormTombstones(): DeletedFormTombstones {
  if (typeof window === "undefined") {
    return { formIds: [], manifestBlobIds: [], blobIds: [], projectFormKeys: [] };
  }
  try {
    const raw = window.localStorage.getItem(DELETED_FORM_TOMBSTONES_KEY);
    if (!raw) {
      return { formIds: [], manifestBlobIds: [], blobIds: [], projectFormKeys: [] };
    }
    const parsed = JSON.parse(raw) as Partial<DeletedFormTombstones>;
    return {
      formIds: Array.isArray(parsed.formIds) ? parsed.formIds.filter((item): item is string => typeof item === "string") : [],
      manifestBlobIds: Array.isArray(parsed.manifestBlobIds)
        ? parsed.manifestBlobIds.filter((item): item is string => typeof item === "string")
        : [],
      blobIds: Array.isArray(parsed.blobIds) ? parsed.blobIds.filter((item): item is string => typeof item === "string") : [],
      projectFormKeys: Array.isArray(parsed.projectFormKeys)
        ? parsed.projectFormKeys.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return { formIds: [], manifestBlobIds: [], blobIds: [], projectFormKeys: [] };
  }
}

function writeDeletedFormTombstones(value: DeletedFormTombstones) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DELETED_FORM_TOMBSTONES_KEY, JSON.stringify(value));
}

function buildProjectFormKey(form: Pick<FormSchema, "projectId" | "onchainFormId">) {
  if (!form.projectId || typeof form.onchainFormId !== "number") {
    return "";
  }
  return `${form.projectId}:${form.onchainFormId}`;
}

export function markDeletedFormTombstones(args: {
  forms?: Array<Pick<FormSchema, "id" | "projectId" | "onchainFormId" | "manifestBlobId" | "blobId">>;
  manifestBlobIds?: string[];
  blobIds?: string[];
}) {
  const current = readDeletedFormTombstones();
  const forms = args.forms ?? [];
  const next: DeletedFormTombstones = {
    formIds: [...new Set([...current.formIds, ...forms.map((form) => form.id)])],
    manifestBlobIds: [
      ...new Set([
        ...current.manifestBlobIds,
        ...forms.map((form) => form.manifestBlobId).filter((item): item is string => typeof item === "string" && item.length > 0),
        ...(args.manifestBlobIds ?? []),
      ]),
    ],
    blobIds: [
      ...new Set([
        ...current.blobIds,
        ...forms.map((form) => form.blobId).filter((item): item is string => typeof item === "string" && item.length > 0),
        ...(args.blobIds ?? []),
      ]),
    ],
    projectFormKeys: [
      ...new Set([
        ...current.projectFormKeys,
        ...forms.map((form) => buildProjectFormKey(form)).filter(Boolean),
      ]),
    ],
  };
  writeDeletedFormTombstones(next);
}

export function isDeletedFormTombstone(form: Pick<FormSchema, "id" | "projectId" | "onchainFormId" | "manifestBlobId" | "blobId">) {
  const tombstones = readDeletedFormTombstones();
  if (tombstones.formIds.includes(form.id)) {
    return true;
  }
  if (form.manifestBlobId && tombstones.manifestBlobIds.includes(form.manifestBlobId)) {
    return true;
  }
  if (form.blobId && tombstones.blobIds.includes(form.blobId)) {
    return true;
  }
  const projectFormKey = buildProjectFormKey(form);
  return Boolean(projectFormKey && tombstones.projectFormKeys.includes(projectFormKey));
}
