import { createMetadataDigest } from "../../lib/projectRegistry";
import { isLocalFallbackBlob } from "../../lib/proof";
import { storageAdapter } from "../../lib/storage";
import { saveFormMetadataOverlay } from "../../storage/formMetadataOverlay";
import type { PreparedPublishForm, ProjectOption } from "./types";
import { wait } from "./utils";

interface PublishFormArgs {
  form: PreparedPublishForm;
  selectedProject: ProjectOption | null;
  setPublishStageIndex: (index: number) => void;
  setPublishBlobId: (blobId: string) => void;
  setPublishStorageMode: (mode: "walrus" | "local") => void;
  setPublishResultNote: (note: string) => void;
  setProjectState: (value: string) => void;
  shouldContinue: () => boolean;
}

export async function publishForm({
  form,
  selectedProject,
  setPublishStageIndex,
  setPublishBlobId,
  setPublishStorageMode,
  setPublishResultNote,
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

  const { blobId, manifestBlobId } = await saveFormPromise;
  if (!shouldContinue()) {
    return null;
  }

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
    setProjectState("Saved to Walrus/local. Register on Sui later when you want an onchain form record.");
    setPublishResultNote("Walrus publish completed. Sui registration is deferred until you explicitly run it.");
  } else {
    await wait(780);
    if (!shouldContinue()) {
      return null;
    }
    setPublishResultNote("Walrus publish completed. The signal is live in local/Walrus mode.");
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

  setPublishStageIndex(5);
  return finalPersistedForm;
}
