import { createMetadataDigest } from "../../lib/projectRegistry";
import { isLocalFallbackBlob } from "../../lib/proof";
import { storageAdapter } from "../../lib/storage";
import { verifyWalrusBlob } from "../../lib/walrusProof";
import { saveFormMetadataOverlay } from "../../storage/formMetadataOverlay";
import type { PreparedPublishForm, ProjectOption, Translate } from "./types";
import { wait } from "./utils";

const MANIFEST_VERIFICATION_TIMEOUT_MS = 12_000;

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

export class PublishFlowError extends Error {
  uploadSucceeded: boolean;
  registryUpdated: boolean;
  diagnostics: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      uploadSucceeded: boolean;
      registryUpdated: boolean;
      diagnostics?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "PublishFlowError";
    this.uploadSucceeded = options.uploadSucceeded;
    this.registryUpdated = options.registryUpdated;
    this.diagnostics = options.diagnostics ?? {};
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: options.cause,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
  }
}

type ManifestVerificationResult =
  | { ok: true }
  | { ok: false; timedOut: boolean; message: string };

function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race([
    task,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]);
}

async function verifyPublishedManifest(form: PreparedPublishForm) {
  if (!form.manifestBlobId || isLocalFallbackBlob(form.manifestBlobId)) {
    return;
  }
  const { readJsonBlobOrThrow, readManifestWithForm } = await import("../../lib/walrus");
  const manifestStatus = await verifyWalrusBlob(form.manifestBlobId);
  if (manifestStatus !== "verified") {
    throw new Error(`Published manifest verification failed: Walrus returned ${manifestStatus} for ${form.manifestBlobId}.`);
  }
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
  const formBlobStatus = await verifyWalrusBlob(carrier.manifest.formBlobId);
  if (formBlobStatus !== "verified") {
    throw new Error(
      `Published form blob verification failed: Walrus returned ${formBlobStatus} for ${carrier.manifest.formBlobId}.`,
    );
  }
  const linkedForm = await readJsonBlobOrThrow<{ id?: string }>(carrier.manifest.formBlobId);
  if (linkedForm.id !== form.id) {
    throw new Error("Published manifest read-back failed: the linked form blob points to a different form.");
  }
}

async function verifyPublishedManifestWithTimeout(form: PreparedPublishForm): Promise<ManifestVerificationResult> {
  try {
    await withTimeout(
      verifyPublishedManifest(form),
      MANIFEST_VERIFICATION_TIMEOUT_MS,
      `Manifest verification timed out after ${Math.round(MANIFEST_VERIFICATION_TIMEOUT_MS / 1000)} seconds.`,
    );
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manifest verification failed.";
    return {
      ok: false,
      timedOut: message.toLowerCase().includes("timed out"),
      message,
    };
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

  let walrusActualCost: PreparedPublishForm["walrusActualCost"];
  let formVersion = form.formVersion;
  let schemaHash = form.schemaHash;
  let blobId = "";
  let manifestBlobId = "";
  try {
    const savedForm = await saveFormPromise;
    formVersion = savedForm.formVersion ?? formVersion;
    schemaHash = savedForm.schemaHash ?? schemaHash;
    blobId = savedForm.blobId ?? "";
    manifestBlobId = savedForm.manifestBlobId ?? "";
    walrusActualCost = savedForm.walrusActualCost;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish upload failed.";
    throw new PublishFlowError(message, {
      uploadSucceeded: false,
      registryUpdated: false,
      diagnostics: {
        formId: form.id,
        projectId: form.projectId ?? "",
      },
      cause: error,
    });
  }
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
    formVersion,
    schemaHash,
    blobId,
    manifestBlobId,
    walrusActualCost,
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
    setPublishActiveStageDetail(t("publishManifestVerificationProgressDetail"));
    const manifestVerification = await verifyPublishedManifestWithTimeout(finalPersistedForm);
    if (!shouldContinue()) {
      return null;
    }
    if (!manifestVerification.ok) {
      console.warn("Manifest verification did not finish cleanly after blob upload.", {
        formId: finalPersistedForm.id,
        blobId: finalPersistedForm.blobId,
        manifestBlobId: finalPersistedForm.manifestBlobId,
        timedOut: manifestVerification.timedOut,
        message: manifestVerification.message,
      });
      setPublishResultNote(
        manifestVerification.timedOut
          ? t("publishManifestVerificationTimedOut")
          : t("publishManifestVerificationDeferred"),
      );
      setPublishActiveStageDetail(
        manifestVerification.timedOut
          ? t("publishManifestVerificationTimedOutDetail")
          : t("publishManifestVerificationDeferredDetail"),
      );
    } else {
      setPublishActiveStageDetail("");
    }
  }

  setPublishActiveStageStatus("");
  setPublishActiveStageDetail("");
  setPublishStageIndex(5);
  return finalPersistedForm;
}
