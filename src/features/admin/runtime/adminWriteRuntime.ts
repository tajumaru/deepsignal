import { Transaction } from "@mysten/sui/transactions";
import {
  createMetadataDigest,
  serializeProjectFormMetadataReference,
  triageStatusToOnchainStatus,
} from "../../../lib/projectRegistry";
import {
  createFormOnChain,
  deleteFormOnChain,
  registerSignalReceipt,
  updateSignalStatusOnChain,
} from "../../../lib/projectRegistryWrite";
import {
  appendWalrusBlobDeletesToTransaction,
  collectWalrusBlobDeleteObjectIds,
  extractMissingWalrusDeleteObjectIds,
} from "../../../storage/walrusAdapter";
import type { FormWithCount } from "../hooks/useSignalInboxData";
import type { SignalRecord } from "../hooks/useSignalInboxData";
import type { Submission } from "../../../types";

type TransactionDigest = { digest: string };

type ExecuteTransaction = (args: { transaction: Transaction }) => Promise<TransactionDigest>;
type WaitForTransaction = (args: {
  digest: string;
  options?: {
    showEvents?: boolean;
  };
}) => Promise<{
  events?: Array<{
    type?: string;
    parsedJson?: unknown;
  }> | null;
}>;

interface DeleteNodeBatchOnSuiArgs {
  onchainFormIds: number[];
  projectId: string | null;
  walrusBlobObjectIds: string[];
  ownerAddress?: string | null;
  executeTransaction: ExecuteTransaction;
  waitForTransaction: (args: { digest: string }) => Promise<unknown>;
  actionLabel: string;
  origin: string;
}

interface RegisterNodeOnSuiArgs {
  form: FormWithCount;
  executeTransaction: ExecuteTransaction;
  waitForTransaction: WaitForTransaction;
}

interface RegisterPublishedFormOnSuiArgs {
  form: {
    id: string;
    title: string;
    blobId?: string;
    manifestBlobId?: string;
    formMetadataDigest?: string;
    projectId?: string;
  };
  executeTransaction: ExecuteTransaction;
  waitForTransaction: (digest: string) => Promise<{
    events?: Array<{
      type?: string;
      parsedJson?: unknown;
    }> | null;
  }>;
}

interface RegisterSignalReceiptOnSuiArgs {
  record: SignalRecord;
  executeTransaction: ExecuteTransaction;
  waitForTransaction: WaitForTransaction;
  actionLabel: string;
  origin: string;
}

interface SyncSignalStatusOnSuiArgs {
  projectId: string;
  onchainSignalId: number;
  triageStatus: Submission["triageStatus"];
  submissionStatus: Submission["status"];
  executeTransaction: ExecuteTransaction;
  waitForTransaction: (args: { digest: string }) => Promise<unknown>;
}

export { collectWalrusBlobDeleteObjectIds };

export async function deleteNodeBatchOnSui(args: DeleteNodeBatchOnSuiArgs) {
  let walrusBlobObjectIds = [...args.walrusBlobObjectIds];

  while (true) {
    try {
      let tx = new Transaction();
      if (args.projectId) {
        for (const onchainFormId of args.onchainFormIds) {
          tx = deleteFormOnChain({
            projectId: args.projectId,
            formId: onchainFormId,
            tx,
          });
        }
      }
      tx = appendWalrusBlobDeletesToTransaction({
        transaction: tx,
        blobObjectIds: walrusBlobObjectIds,
        ownerAddress: args.ownerAddress,
      });

      console.info("[DeepSignal Sui write]", {
        action: "delete_signal_node",
        actionLabel: args.actionLabel,
        origin: args.origin,
        projectId: args.projectId,
        onchainFormIds: args.onchainFormIds,
        walrusBlobObjectIds,
      });
      const result = await args.executeTransaction({ transaction: tx });
      await args.waitForTransaction({ digest: result.digest });
      return {
        walrusDeleteHandledInBatch: walrusBlobObjectIds.length > 0,
      };
    } catch (error) {
      const missingObjectIds = extractMissingWalrusDeleteObjectIds(error);
      if (missingObjectIds.length > 0) {
        const missingSet = new Set(missingObjectIds);
        const nextWalrusBlobObjectIds = walrusBlobObjectIds.filter(
          (blobObjectId) => !missingSet.has(blobObjectId.toLowerCase()),
        );
        if (nextWalrusBlobObjectIds.length !== walrusBlobObjectIds.length) {
          walrusBlobObjectIds = nextWalrusBlobObjectIds;
          if (walrusBlobObjectIds.length === 0 && args.onchainFormIds.length === 0) {
            return { walrusDeleteHandledInBatch: false };
          }
          continue;
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("find_form_index")) {
        console.warn("One or more on-chain forms were already absent during node delete. Continuing local cleanup.");
        return { walrusDeleteHandledInBatch: false };
      }
      throw error;
    }
  }
}

export async function registerNodeOnSui(args: RegisterNodeOnSuiArgs) {
  const formMetadataDigest =
    args.form.formMetadataDigest ??
    await createMetadataDigest({
      localFormId: args.form.id,
      title: args.form.title,
      description: args.form.description,
      purpose: args.form.purpose,
      visibility: args.form.visibility,
      publicExplore: args.form.publicExplore,
      fieldCount: args.form.fields.length,
      sectionCount: args.form.sections?.length ?? 0,
      encryptSubmissions: args.form.encryptSubmissions,
      responseDeadline: args.form.responseDeadline ?? null,
      responseDeadlineMode: args.form.responseDeadlineMode ?? "none",
      ownerAddress: args.form.ownerAddress,
      projectId: args.form.projectId ?? null,
    });
  const metadataReference = serializeProjectFormMetadataReference({
    digest: formMetadataDigest,
    manifestBlobId: args.form.manifestBlobId,
    formBlobId: args.form.blobId,
    formId: args.form.id,
  });
  const tx = createFormOnChain({
    projectId: args.form.projectId ?? "",
    title: args.form.title,
    metadataDigest: metadataReference,
  });

  console.info("[DeepSignal Sui write]", {
    action: "register_signal_node",
    actionLabel: "Register on Sui",
    origin: "register-node-button",
    projectId: args.form.projectId,
    formId: args.form.id,
  });

  const result = await args.executeTransaction({ transaction: tx });
  const confirmed = await args.waitForTransaction({
    digest: result.digest,
    options: { showEvents: true },
  });
  const formCreatedEvent = (confirmed.events ?? []).find((chainEvent) =>
    String(chainEvent.type ?? "").endsWith("::FormCreated"),
  );
  const rawFormId = (formCreatedEvent?.parsedJson as { form_id?: string | number } | undefined)?.form_id;
  const parsedFormId = typeof rawFormId === "number" ? rawFormId : Number(rawFormId ?? Number.NaN);
  if (!Number.isFinite(parsedFormId)) {
    throw new Error("Sui registration completed, but the new form id was not returned.");
  }

  return {
    formMetadataDigest,
    onchainFormId: parsedFormId,
    txDigest: result.digest,
  };
}

export async function registerPublishedFormOnSui(args: RegisterPublishedFormOnSuiArgs) {
  const metadataReference =
    args.form.manifestBlobId
      ? serializeProjectFormMetadataReference({
          digest: args.form.formMetadataDigest ?? "",
          manifestBlobId: args.form.manifestBlobId,
          formBlobId: args.form.blobId,
          formId: args.form.id,
        })
      : args.form.formMetadataDigest ?? "";
  const tx = createFormOnChain({
    projectId: args.form.projectId ?? "",
    title: args.form.title,
    metadataDigest: metadataReference,
  });

  const result = await args.executeTransaction({ transaction: tx });
  const confirmed = await args.waitForTransaction(result.digest);
  const formCreatedEvent = (confirmed.events ?? []).find((chainEvent) =>
    String(chainEvent.type ?? "").endsWith("::FormCreated"),
  );
  const rawFormId = (formCreatedEvent?.parsedJson as { form_id?: string | number } | undefined)?.form_id;
  const parsedFormId = typeof rawFormId === "number" ? rawFormId : Number(rawFormId ?? Number.NaN);
  if (!Number.isFinite(parsedFormId)) {
    throw new Error("Sui registration completed, but the new form id was not returned.");
  }

  return {
    onchainFormId: parsedFormId,
    txDigest: result.digest,
  };
}

export async function registerSignalReceiptOnSui(args: RegisterSignalReceiptOnSuiArgs) {
  const { form, submission } = args.record;
  const signalReceiptMetadataDigest = await createMetadataDigest({
    submissionId: submission.id,
    formId: submission.formId,
    createdAt: submission.createdAt,
    receiptBlobId: submission.receiptBlobId,
    attachmentBlobIds: submission.attachments.map((attachment) => attachment.blobId),
    encrypted: submission.isEncrypted,
    sealIdentity: submission.sealIdentity ?? null,
    respondentWalletAddress: submission.respondentMeta?.walletAddress ?? null,
    respondentSessionId: submission.respondentMeta?.sessionId ?? null,
    isAnonymous: submission.respondentMeta?.isAnonymous ?? true,
  });
  const tx = registerSignalReceipt({
    projectId: form.projectId ?? "",
    formId: form.onchainFormId ?? 0,
    walrusBlobId: submission.receiptBlobId ?? "",
    metadataDigest: signalReceiptMetadataDigest,
    encrypted: submission.isEncrypted,
    sealIdentity: submission.sealIdentity ?? null,
  });

  console.info("[DeepSignal Sui write]", {
    action: "register_signal_receipt",
    actionLabel: args.actionLabel,
    origin: args.origin,
    projectId: form.projectId,
    formId: form.id,
    onchainFormId: form.onchainFormId,
    signalId: submission.id,
  });

  const result = await args.executeTransaction({ transaction: tx });
  const confirmed = await args.waitForTransaction({
    digest: result.digest,
    options: { showEvents: true },
  });
  const signalRegisteredEvent = (confirmed.events ?? []).find((chainEvent) =>
    String(chainEvent.type ?? "").endsWith("::SignalRegistered"),
  );
  const rawSignalId = (signalRegisteredEvent?.parsedJson as { signal_id?: string | number } | undefined)?.signal_id;
  const parsedSignalId = typeof rawSignalId === "number" ? rawSignalId : Number(rawSignalId ?? Number.NaN);

  return {
    signalReceiptMetadataDigest,
    onchainSignalId: Number.isFinite(parsedSignalId) ? parsedSignalId : undefined,
    txDigest: result.digest,
  };
}

export async function syncSignalStatusOnSui(args: SyncSignalStatusOnSuiArgs) {
  const onchainStatus = triageStatusToOnchainStatus(args.triageStatus, args.submissionStatus);
  const tx = updateSignalStatusOnChain({
    projectId: args.projectId,
    signalId: args.onchainSignalId,
    status: onchainStatus,
  });

  console.info("[DeepSignal Sui write]", {
    action: "update_signal_status",
    actionLabel: "Review & Triage save",
    origin: "review-save-status-sync",
    projectId: args.projectId,
    onchainSignalId: args.onchainSignalId,
    nextOnchainStatus: onchainStatus,
  });

  const result = await args.executeTransaction({ transaction: tx });
  await args.waitForTransaction({ digest: result.digest });

  return {
    onchainStatus,
    txDigest: result.digest,
  };
}
