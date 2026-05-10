import { createFormOnChain, createMetadataDigest } from "../../lib/projectRegistry";
import { isLocalFallbackBlob } from "../../lib/proof";
import { storageAdapter } from "../../lib/storage";
import { saveFormMetadataOverlay } from "../../storage/formMetadataOverlay";
import type { CreateFormTransaction, PreparedPublishForm, ProjectOption, TransactionConfirmation } from "./types";
import { wait } from "./utils";

interface PublishFormArgs {
  form: PreparedPublishForm;
  selectedProject: ProjectOption | null;
  setPublishStageIndex: (index: number) => void;
  setPublishBlobId: (blobId: string) => void;
  setPublishStorageMode: (mode: "walrus" | "local") => void;
  setPublishResultNote: (note: string) => void;
  setProjectState: (value: string) => void;
  signAndExecuteTransaction: (transaction: CreateFormTransaction) => Promise<{ digest: string }>;
  waitForTransaction: (digest: string) => Promise<TransactionConfirmation>;
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
  signAndExecuteTransaction,
  waitForTransaction,
  shouldContinue,
}: PublishFormArgs): Promise<PreparedPublishForm | null> {
  const formMetadataDigest = await createMetadataDigest({
    localFormId: form.id,
    title: form.title,
    description: form.description,
    purpose: form.purpose,
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

  let onchainFormId: number | undefined;
  let isOnchain = false;

  if (selectedProject?.objectId) {
    await wait(780);
    if (!shouldContinue()) {
      return null;
    }
    setPublishStageIndex(4);
    try {
      const tx = createFormOnChain({
        projectId: selectedProject.objectId,
        title: form.title,
        metadataDigest: formMetadataDigest,
      });
      const result = await signAndExecuteTransaction(tx);
      const confirmed = await waitForTransaction(result.digest);
      const formCreatedEvent = (confirmed.events ?? []).find((chainEvent) =>
        String(chainEvent.type ?? "").endsWith("::FormCreated"),
      );
      const rawFormId = (formCreatedEvent?.parsedJson as { form_id?: string | number } | undefined)?.form_id;
      const parsedFormId = typeof rawFormId === "number" ? rawFormId : Number(rawFormId ?? Number.NaN);
      if (Number.isFinite(parsedFormId)) {
        onchainFormId = parsedFormId;
        isOnchain = true;
        setPublishResultNote("Signal registration confirmed. Share links and inbox routing are now live.");
      }
    } catch (chainError) {
      console.warn("create_form failed, keeping local/Walrus form only", chainError);
      setProjectState(
        chainError instanceof Error
          ? `Project link skipped: ${chainError.message}`
          : "Project link skipped. The form is still available through local/Walrus storage.",
      );
      setPublishResultNote("Walrus publish completed. Signal registry link was skipped after the final wallet step.");
    }
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
    onchainFormId,
    isOnchain,
  } satisfies PreparedPublishForm;

  saveFormMetadataOverlay(finalForm);
  if (!shouldContinue()) {
    return null;
  }

  setPublishStageIndex(5);
  return finalForm;
}
