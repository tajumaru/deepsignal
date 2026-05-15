import { createMetadataDigest } from "../../lib/projectRegistry";
import { isLocalFallbackBlob } from "../../lib/proof";
import { storageAdapter } from "../../lib/storage";
import { saveFormMetadataOverlay } from "../../storage/formMetadataOverlay";
import type { PreparedPublishForm, ProjectOption, Translate } from "./types";
import { wait } from "./utils";

interface PublishFormArgs {
  t: Translate;
  form: PreparedPublishForm;
  selectedProject: ProjectOption | null;
  setPublishStageIndex: (index: number) => void;
  setPublishBlobId: (blobId: string) => void;
  setPublishStorageMode: (mode: "walrus" | "local") => void;
  setPublishResultNote: (note: string) => void;
  setPublishActiveStageStatus: (status: string) => void;
  setPublishActiveStageDetail: (detail: string) => void;
  setProjectState: (value: string) => void;
  shouldContinue: () => boolean;
}

async function verifyPublishedPublicLink(form: PreparedPublishForm) {
  if (!form.manifestBlobId || isLocalFallbackBlob(form.manifestBlobId)) {
    return;
  }
  const { readJsonBlobOrThrow, readManifestWithForm } = await import("../../storage/walrusAdapter");
  const carrier = await readManifestWithForm(form.manifestBlobId);
  if (carrier.manifest.formId !== form.id) {
    throw new Error("Published manifest read-back failed: the manifest points to a different form.");
  }
  if (carrier.form) {
    if (carrier.form.id !== form.id) {
      throw new Error("Published manifest read-back failed: the bundled form points to a different form.");
    }
    return;
  }
  if (!carrier.manifest.formBlobId || carrier.manifest.formBlobId === "__bundled_form__") {
    throw new Error("Published manifest read-back failed: the manifest does not include a bundled form or form blob.");
  }
  const linkedForm = await readJsonBlobOrThrow<{ id?: string }>(carrier.manifest.formBlobId);
  if (linkedForm.id !== form.id) {
    throw new Error("Published manifest read-back failed: the linked form blob points to a different form.");
  }
}

export async function publishForm({
  t,
  form,
  selectedProject,
  setPublishStageIndex,
  setPublishBlobId,
  setPublishStorageMode,
  setPublishResultNote,
  setPublishActiveStageStatus,
  setPublishActiveStageDetail,
  setProjectState,
  shouldContinue,
}: PublishFormArgs): Promise<PreparedPublishForm | null> {
  const formMetadataDigest = await createMetadataDigest({
    localFormId: form.id,
    title: form.title,
    description: form.description,
    purpose: form.purpose,
    visibility: form.visibility,
    publicExplore: form.publicExplore,
    fieldCount: form.fields.length,
    sectionCount: form.sections?.length ?? 0,
    encryptSubmissions: form.encryptSubmissions,
    responseDeadline: form.responseDeadline ?? null,
    responseDeadlineMode: form.responseDeadlineMode ?? "none",
    ownerAddress: form.ownerAddress,
    projectId: form.projectId ?? null,
  });

  setPublishStageIndex(0);
  const saveFormPromise = storageAdapter.saveForm({
    ...form,
    formMetadataDigest,
  });

  await wait(120);
  if (!shouldContinue()) {
    return null;
  }
  setPublishStageIndex(1);

  await wait(180);
  if (!shouldContinue()) {
    return null;
  }
  setPublishStageIndex(2);
  setPublishActiveStageStatus(t("walletApprovalStatus"));
  setPublishActiveStageDetail(t("walletApprovalDetail"));

  const { blobId, manifestBlobId } = await saveFormPromise;
  if (!shouldContinue()) {
    return null;
  }
  setPublishActiveStageStatus(t("publishInProgressStatus"));
  setPublishActiveStageDetail("");

  await wait(620);
  setPublishStageIndex(3);
  setPublishBlobId(blobId ?? "unresolved");
  setPublishStorageMode(isLocalFallbackBlob(blobId) ? "local" : "walrus");

  if (selectedProject?.objectId) {
    await wait(780);
    if (!shouldContinue()) {
      return null;
    }
    setPublishStageIndex(4);
    setProjectState(t("projectStateSavedRegisterLater"));
    setPublishResultNote(t("publishResultDeferredSui"));
  } else {
    await wait(780);
    if (!shouldContinue()) {
      return null;
    }
    setPublishResultNote(t("publishResultLiveLocalWalrus"));
  }

  const finalForm = {
    ...form,
    blobId,
    manifestBlobId,
    formMetadataDigest,
    isOnchain: false,
    registrationMode: "walrus",
  } satisfies PreparedPublishForm;

  const finalPersistedForm = {
    ...finalForm,
  } satisfies PreparedPublishForm;

  setPublishBlobId(finalPersistedForm.blobId ?? "unresolved");
  saveFormMetadataOverlay(finalPersistedForm);
  if (!shouldContinue()) {
    return null;
  }

  if (finalPersistedForm.manifestBlobId && !isLocalFallbackBlob(finalPersistedForm.manifestBlobId)) {
    setPublishActiveStageStatus(t("verifyingManifest"));
    setPublishActiveStageDetail(t("shareLinkVerifyCopyBlocked"));
    await verifyPublishedPublicLink(finalPersistedForm);
    if (!shouldContinue()) {
      return null;
    }
  }

  setPublishActiveStageStatus("");
  setPublishActiveStageDetail("");
  setPublishStageIndex(5);
  return finalPersistedForm;
}
