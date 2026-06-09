import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  useSignAndExecuteTransaction,
  useSuiClient,
} from "../../../lib/mystenDappKitCompat";
import { getSignalSubject, isLocalFallbackBlob } from "../../../lib/signalInbox";
import { normalizeSubmission } from "../../../lib/submissionSchema";
import { storageAdapter } from "../../../lib/storageAdapter";
import { cleanupRegisteredSubmissionLocalFallback } from "../../../storage/localStorageAdapter";
import { useI18n } from "../../../i18n";
import { useRpcInfrastructure } from "../../../rpcInfrastructure";
import type { Submission } from "../../../types";
import type { AdminToastState } from "./useAdminToast";
import type { SignalRecord } from "./useSignalInboxData";

interface UsePendingSuiRegistrationArgs {
  allSignals: SignalRecord[];
  pendingSignalIdSet: Set<string>;
  applySubmissionUpdate: (submission: Submission) => void;
  setToast: Dispatch<SetStateAction<AdminToastState | null>>;
}

interface RegisterPendingSignalsOptions {
  origin?: string;
  actionLabel?: string;
}

export function usePendingSuiRegistration({
  allSignals,
  pendingSignalIdSet,
  applySubmissionUpdate,
  setToast,
}: UsePendingSuiRegistrationArgs) {
  const suiClient = useSuiClient();
  const rpcInfrastructure = useRpcInfrastructure();
  const { t } = useI18n();
  const registerSignalReceiptTx = useSignAndExecuteTransaction();
  const [selectedPendingSignalIds, setSelectedPendingSignalIds] = useState<string[]>([]);
  const [registeringSignalIds, setRegisteringSignalIds] = useState<string[]>([]);

  async function loadAdminWriteRuntimeModule() {
    return import("../runtime/adminWriteRuntime");
  }

  useEffect(() => {
    setSelectedPendingSignalIds((current) => {
      const next = current.filter((signalId) => pendingSignalIdSet.has(signalId));
      return next.length === current.length ? current : next;
    });
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

  function setPendingSelections(signalIds: string[], selected: boolean) {
    const normalizedIds = signalIds.filter(Boolean);
    if (normalizedIds.length === 0) {
      return;
    }
    setSelectedPendingSignalIds((current) => {
      if (selected) {
        return [...new Set([...current, ...normalizedIds])];
      }
      return current.filter((signalId) => !normalizedIds.includes(signalId));
    });
  }

  async function registerSubmissionRecordOnSui(record: SignalRecord, options: Required<RegisterPendingSignalsOptions>) {
    const { form, submission } = record;
    if (
      !form.projectId ||
      typeof form.onchainFormId !== "number" ||
      !submission.receiptBlobId ||
      isLocalFallbackBlob(submission.receiptBlobId)
    ) {
      throw new Error("This signal is not eligible for Sui registration yet.");
    }

    const { registerSignalReceiptOnSui } = await loadAdminWriteRuntimeModule();
    const registration = await registerSignalReceiptOnSui({
      record,
      actionLabel: options.actionLabel,
      origin: options.origin,
      executeTransaction: ({ transaction }) =>
        registerSignalReceiptTx.mutateAsync({ transaction }),
      waitForTransaction: ({ digest, options: waitOptions }) =>
        suiClient.waitForTransaction({
          digest,
          options: waitOptions,
        }),
    });
    const registeredSubmission = normalizeSubmission({
      ...submission,
      metadata: {
        ...(submission.metadata ?? {}),
        txDigest: registration.txDigest,
        rpcProvider: rpcInfrastructure.providerLabel,
        rpcUrl: rpcInfrastructure.displayRpcUrl,
        network: rpcInfrastructure.connectedNetworkLabel,
      },
      pendingOnchainRegistration: false,
      onchainSignalId: registration.onchainSignalId,
      signalReceiptMetadataDigest: registration.signalReceiptMetadataDigest,
      onchainStatus: "new",
      updatedAt: new Date().toISOString(),
    });
    await storageAdapter.updateSubmission(registeredSubmission);
    await cleanupRegisteredSubmissionLocalFallback(registeredSubmission);
    applySubmissionUpdate(registeredSubmission);
    return registeredSubmission;
  }

  async function handleRegisterPendingSignals(targetSignalIds?: string[], options: RegisterPendingSignalsOptions = {}) {
    const actionLabel = options.actionLabel ?? t("registerOnSui");
    const origin = options.origin ?? "pending-sui-registration";
    const nextTargetIds = (targetSignalIds ?? selectedPendingSignalIds).filter(Boolean);
    if (nextTargetIds.length === 0) {
      setToast({ tone: "error", message: t("selectPendingSignalFirst") });
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
      setToast({ tone: "error", message: t("noPendingSuiRegistrationsFound") });
      return;
    }

    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        `${actionLabel}\n\nRegister ${targetRecords.length} pending signal${
          targetRecords.length === 1 ? "" : "s"
        } on Sui? This will request a wallet transaction.`,
      );
    if (!confirmed) {
      console.info("[DeepSignal Sui write cancelled]", {
        action: "register_signal_receipt",
        actionLabel,
        origin,
        count: targetRecords.length,
      });
      return;
    }

    setRegisteringSignalIds((current) => [...new Set([...current, ...targetRecords.map((record) => record.submission.id)])]);
    const successes: string[] = [];
    const failures: string[] = [];

    for (const record of targetRecords) {
      try {
        await registerSubmissionRecordOnSui(record, { actionLabel, origin });
        successes.push(record.submission.id);
      } catch (error) {
        console.warn("register_signal failed from admin dashboard", error);
        failures.push(
          error instanceof Error
            ? `${getSignalSubject(record.submission)}: ${error.message}`
            : `${getSignalSubject(record.submission)}: ${t("failedToRegisterOnSui")}`,
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
            ? `${t("registeredSignalsOnSui", { count: successes.length })} ${failures[0]}`
            : failures[0],
      });
      return;
    }
    setToast({
      tone: "success",
      message: t("registeredPendingSignalsOnSui", { count: successes.length }),
    });
  }

  return {
    selectedPendingSignalIds,
    registeringSignalIds,
    isRegisteringSignal,
    togglePendingSelection,
    setPendingSelections,
    handleRegisterPendingSignals,
  };
}
