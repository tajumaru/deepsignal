let myResponseHistoryPromise: Promise<typeof import("../../../storage/myResponseHistory")> | null = null;
let storageFactoryPromise: Promise<typeof import("../../../storage/storageFactory")> | null = null;
let submissionDeliveryPromise: Promise<typeof import("../../../storage/submissionDelivery")> | null = null;
let submittedHistoryPromise: Promise<typeof import("../../../storage/submittedHistory")> | null = null;

function loadMyResponseHistory() {
  myResponseHistoryPromise ??= import("../../../storage/myResponseHistory");
  return myResponseHistoryPromise;
}

function loadStorageFactory() {
  storageFactoryPromise ??= import("../../../storage/storageFactory");
  return storageFactoryPromise;
}

function loadSubmissionDelivery() {
  submissionDeliveryPromise ??= import("../../../storage/submissionDelivery");
  return submissionDeliveryPromise;
}

function loadSubmittedHistory() {
  submittedHistoryPromise ??= import("../../../storage/submittedHistory");
  return submittedHistoryPromise;
}

export async function upsertPublicHistoryEntry(args: unknown) {
  const { buildMyResponseHistoryEntry, upsertMyResponseHistoryEntry } = await loadMyResponseHistory();
  upsertMyResponseHistoryEntry(buildMyResponseHistoryEntry(args as never));
}

export async function upsertFailedPublicDraft(args: unknown) {
  const { buildFailedMyResponseDraft, upsertMyResponseHistoryEntry } = await loadMyResponseHistory();
  upsertMyResponseHistoryEntry(buildFailedMyResponseDraft(args as never));
}

export async function retryPublicPendingSubmissionSync(args: {
  allowWalletPrompt: boolean;
}) {
  const { retryPendingSubmissionSync } = await loadStorageFactory();
  return retryPendingSubmissionSync(args);
}

export async function enqueuePublicPendingSubmission(submission: unknown) {
  const { enqueuePendingSubmission } = await loadSubmissionDelivery();
  return enqueuePendingSubmission(submission as never);
}

export async function removePublicPendingSubmission(submissionId: string) {
  const { removePendingSubmission } = await loadSubmissionDelivery();
  return removePendingSubmission(submissionId);
}

export async function savePublicSubmittedHistoryEntry(args: unknown) {
  const { saveSubmittedHistoryEntry } = await loadSubmittedHistory();
  return saveSubmittedHistoryEntry(args as never);
}
