import type { FormSchema } from "../types";

const FORM_METADATA_OVERLAY_KEY = "deepsignal.formMetadataOverlays";

type FormMetadataOverlay = Pick<
  FormSchema,
  | "id"
  | "isOnchain"
  | "onchainFormId"
  | "registrationMode"
  | "formMetadataDigest"
  | "projectId"
  | "projectName"
  | "ownerAddress"
  | "creationMode"
  | "encryptSubmissions"
  | "responseDeadline"
  | "responseDeadlineMode"
  | "blobId"
  | "manifestBlobId"
  | "activityEvents"
>;

function readOverlays() {
  if (typeof window === "undefined") {
    return {} as Record<string, FormMetadataOverlay>;
  }
  try {
    const raw = window.localStorage.getItem(FORM_METADATA_OVERLAY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, FormMetadataOverlay>) : {};
  } catch {
    return {};
  }
}

function writeOverlays(value: Record<string, FormMetadataOverlay>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FORM_METADATA_OVERLAY_KEY, JSON.stringify(value));
}

export function saveFormMetadataOverlay(form: FormSchema) {
  const overlays = readOverlays();
  overlays[form.id] = {
    id: form.id,
    isOnchain: form.isOnchain,
    onchainFormId: form.onchainFormId,
    registrationMode: form.registrationMode,
    formMetadataDigest: form.formMetadataDigest,
    projectId: form.projectId,
    projectName: form.projectName,
    ownerAddress: form.ownerAddress,
    creationMode: form.creationMode,
    encryptSubmissions: form.encryptSubmissions,
    responseDeadline: form.responseDeadline ?? null,
    responseDeadlineMode: form.responseDeadlineMode ?? "none",
    blobId: form.blobId,
    manifestBlobId: form.manifestBlobId,
    activityEvents: form.activityEvents,
  };
  writeOverlays(overlays);
}

export function clearFormMetadataOverlay(formId: string) {
  const overlays = readOverlays();
  if (!(formId in overlays)) {
    return;
  }
  delete overlays[formId];
  writeOverlays(overlays);
}

export function applyFormMetadataOverlay(form: FormSchema | null) {
  if (!form) {
    return null;
  }
  const overlay = readOverlays()[form.id];
  return overlay ? { ...form, ...overlay } : form;
}

export function applyFormMetadataOverlays(forms: FormSchema[]) {
  const overlays = readOverlays();
  return forms.map((form) => {
    const overlay = overlays[form.id];
    return overlay ? { ...form, ...overlay } : form;
  });
}
