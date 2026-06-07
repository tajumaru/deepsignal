import type { FormSchema, Submission } from "../../../types";

let storageSealPromise: Promise<typeof import("../../../lib/storageSeal")> | null = null;
let walrusPromise: Promise<typeof import("../../../lib/walrus")> | null = null;

function loadStorageSeal() {
  storageSealPromise ??= import("../../../lib/storageSeal");
  return storageSealPromise;
}

function loadWalrus() {
  walrusPromise ??= import("../../../lib/walrus");
  return walrusPromise;
}

export async function createPublicInlineAttachment(file: File, maxBytes: number) {
  const { createInlinePrivateAttachment } = await loadStorageSeal();
  return createInlinePrivateAttachment(file, maxBytes);
}

export async function uploadPublicFile(file: File) {
  const { storageAdapter } = await loadStorageSeal();
  return storageAdapter.uploadFile(file);
}

export async function savePublicSubmissionWithEncryption(
  form: FormSchema,
  submission: Submission,
  options: unknown,
) {
  const { activeSealAdapter, saveSubmissionWithEncryption, storageAdapter } = await loadStorageSeal();
  return saveSubmissionWithEncryption(form, submission, activeSealAdapter, storageAdapter, options as never);
}

export async function uploadPublicAttachmentRuntime(args: {
  accountAddress?: string;
  attachmentFile: File;
  expectedNetwork: string;
  expectedRpcUrl: string;
  formOwnerAddress?: string;
  formProjectId?: string;
  identityMode: "anonymous" | "wallet" | "zklogin";
  requiresProtectedAttachment: boolean;
}) {
  const [{ activeSealAdapter, createEncryptedAttachmentUpload, getStorageRuntimeStatus, storageAdapter }, walrus] =
    await Promise.all([loadStorageSeal(), loadWalrus()]);

  if (args.identityMode === "wallet" && args.accountAddress) {
    await walrus.waitForWalrusMutationRuntimeReady({
      requireWallet: true,
      timeoutMs: 7000,
      expectedRpcUrl: args.expectedRpcUrl,
      expectedNetwork: args.expectedNetwork,
    });
  }

  const uploadFile = args.requiresProtectedAttachment
    ? (
        await createEncryptedAttachmentUpload(args.attachmentFile, activeSealAdapter, {
          projectId: args.formProjectId,
          ownerAddress: args.formOwnerAddress,
        })
      ).file
    : args.attachmentFile;

  const upload = await storageAdapter.uploadFile(uploadFile);
  return {
    storageRuntime: getStorageRuntimeStatus(),
    upload,
  };
}
