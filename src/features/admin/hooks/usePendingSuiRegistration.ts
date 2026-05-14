import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  createMetadataDigest,
  registerSignalReceipt,
} from "../../../lib/projectRegistry";
import { getSignalSubject, isLocalFallbackBlob } from "../../../lib/signalInbox";
import {
  normalizeSubmission,
  storageAdapter,
} from "../../../lib/storage";
import type { Submission } from "../../../types";
import type { AdminToastState } from "./useAdminToast";
import type { SignalRecord } from "./useSignalInboxData";

interface UsePendingSuiRegistrationArgs {
  allSignals: SignalRecord[];
  pendingSignalIdSet: Set<string>;
  applySubmissionUpdate: (submission: Submission) => void;
  setToast: Dispatch<SetStateAction<AdminToastState | null>>;
}

export function usePendingSuiRegistration({
  allSignals,
  pendingSignalIdSet,
  applySubmissionUpdate,
  setToast,
}: UsePendingSuiRegistrationArgs) {
  const suiClient = useSuiClient();
  const registerSignalReceiptTx = useSignAndExecuteTransaction();
  const [selectedPendingSignalIds, setSelectedPendingSignalIds] = useState<string[]>([]);
  const [registeringSignalIds, setRegisteringSignalIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedPendingSignalIds((current) =>
      current.filter((signalId) => pendingSignalIdSet.has(signalId)),
    );
  }, [pendingSignalIdSet]);

  function isRegisteringSignal(signalId: string) {
    return registeringSignalIds.includes(signalId);
  }

  function togglePendingSelection(signalId: string) {
    setSelectedPendingSignalIds((current) =>
      current.includes(signalId)
        ? current.filter((entry) => entry !== signalId)
        : [...current, signalId],
    );
  }

  async function registerSubmissionRecordOnSui(record: SignalRecord) {
    const { form, submission } = record;
    if (
      !form.projectId ||
      typeof form.onchainFormId !== "number" ||
      !submission.receiptBlobId ||
      isLocalFallbackBlob(submission.receiptBlobId)
    ) {
      throw new Error("This signal is not eligible for Sui registration yet.");
    }

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
      projectId: form.projectId,
      formId: form.onchainFormId,
      walrusBlobId: submission.receiptBlobId,
      metadataDigest: signalReceiptMetadataDigest,
      encrypted: submission.isEncrypted,
      sealIdentity: submission.sealIdentity ?? null,
    });
    const result = await registerSignalReceiptTx.mutateAsync({ transaction: tx });
    const confirmed = await suiClient.waitForTransaction({
      digest: result.digest,
      options: { showEvents: true },
    });
    const signalRegisteredEvent = (confirmed.events ?? []).find((chainEvent) =>
      String(chainEvent.type ?? "").endsWith("::SignalRegistered"),
    );
    const rawSignalId = (signalRegisteredEvent?.parsedJson as { signal_id?: string | number } | undefined)?.signal_id;
    const parsedSignalId = typeof rawSignalId === "number" ? rawSignalId : Number(rawSignalId ?? Number.NaN);
    const registeredSubmission = normalizeSubmission({
      ...submission,
      pendingOnchainRegistration: false,
      onchainSignalId: Number.isFinite(parsedSignalId) ? parsedSignalId : undefined,
      signalReceiptMetadataDigest,
      onchainStatus: "new",
      updatedAt: new Date().toISOString(),
    });
    await storageAdapter.updateSubmission(registeredSubmission);
    applySubmissionUpdate(registeredSubmission);
    return registeredSubmission;
  }

  async function handleRegisterPendingSignals(targetSignalIds?: string[]) {
    const nextTargetIds = (targetSignalIds ?? selectedPendingSignalIds).filter(Boolean);
    if (nextTargetIds.length === 0) {
      setToast({ tone: "error", message: "Select at least one pending signal first." });
      return;
    }

    const targetRecords = nextTargetIds
      .map((signalId) =>
        allSignals.find(
          (record) =>
            record.submission.id === signalId && record.submission.pendingOnchainRegistration,
        ) ?? null,
      )
      .filter((record): record is SignalRecord => Boolean(record));
    if (targetRecords.length === 0) {
      setToast({ tone: "error", message: "No pending Sui registrations were found for the selected signals." });
      return;
    }

    setRegisteringSignalIds((current) => [...new Set([...current, ...targetRecords.map((record) => record.submission.id)])]);
    const successes: string[] = [];
    const failures: string[] = [];

    for (const record of targetRecords) {
      try {
        await registerSubmissionRecordOnSui(record);
        successes.push(record.submission.id);
      } catch (error) {
        console.warn("register_signal failed from admin dashboard", error);
        failures.push(
          error instanceof Error
            ? `${getSignalSubject(record.submission)}: ${error.message}`
            : `${getSignalSubject(record.submission)}: Failed to register on Sui.`,
        );
      }
    }

    setRegisteringSignalIds((current) =>
      current.filter((signalId) => !targetRecords.some((record) => record.submission.id === signalId)),
    );
    if (successes.length > 0) {
      setSelectedPendingSignalIds((current) =>
        current.filter((signalId) => !successes.includes(signalId)),
      );
    }
    if (failures.length > 0) {
      setToast({
        tone: successes.length > 0 ? "success" : "error",
        message:
          successes.length > 0
            ? `Registered ${successes.length} signal${successes.length === 1 ? "" : "s"} on Sui. ${failures[0]}`
            : failures[0],
      });
      return;
    }
    setToast({
      tone: "success",
      message: `Registered ${successes.length} pending signal${successes.length === 1 ? "" : "s"} on Sui.`,
    });
  }

  return {
    selectedPendingSignalIds,
    registeringSignalIds,
    isRegisteringSignal,
    togglePendingSelection,
    handleRegisterPendingSignals,
  };
}
