import {
  useSignPersonalMessage,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  REAL_SEAL_SESSION_TTL_MIN,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_WALLET_CANCELLED_MESSAGE,
  getReviewerCapIdForDecrypt,
} from "../../../lib/seal";
import { isDecryptDiagnosticError, type DecryptDiagnosticContext } from "../../../crypto/decryptDiagnostics";
import type { CapabilityProfile } from "../../../hooks/useAccessControl";
import { logRouteLifecycle } from "../../../lib/routeDiagnostics";
import { getPrivateSignalPayloadState } from "../../../lib/signalInbox";
import { resolveSubmissionAnswers } from "../../../lib/storage";
import { reportSystemError } from "../../../services/systemSignalReporter";
import type { SealDecryptContext, Submission } from "../../../types";
import type { SignalRecord } from "./useSignalInboxData";

type ToastSetter = (toast: { tone: "success" | "error"; message: string } | null) => void;
type DecryptedSignalCacheEntry = {
  answers: Record<string, unknown>;
  attachments: Submission["attachments"];
  legacyUnencrypted: boolean;
};

export type PrivateSignalDecryptUiState =
  | "locked"
  | "checking_access"
  | "waiting_wallet_approval"
  | "decrypting"
  | "decrypted"
  | "unauthorized"
  | "failed";

function getDecryptStatusMessage(
  status:
    | "loading_seal_runtime"
    | "validating_access_policy"
    | "waiting_wallet_approval"
    | "decrypting_encrypted_payload"
    | "signal_unlocked",
  messages: DecryptMessages,
) {
  switch (status) {
    case "loading_seal_runtime":
      return messages.loadingSealRuntime;
    case "validating_access_policy":
      return messages.validatingAccessPolicy;
    case "waiting_wallet_approval":
      return messages.requestingWalletApproval;
    case "decrypting_encrypted_payload":
      return messages.decryptingEncryptedPayload;
    case "signal_unlocked":
      return messages.signalUnlocked;
  }
}

interface DecryptMessages {
  loadingSealRuntime: string;
  validatingAccessPolicy: string;
  requestingWalletApproval: string;
  decryptingEncryptedPayload: string;
  signalUnlocked: string;
  connectWalletToUnlockSignal: string;
  unauthorizedWalletDecrypt: string;
  sealSessionExpired: string;
  walletApprovalRequiredToDecrypt: string;
  encryptionPolicyMismatch: string;
  manifestMismatchDetected: string;
  blobFetchFailed: string;
  onchainPayloadReferenceMissing: string;
  onchainPayloadBlobMissing: string;
  encryptedPayloadMissing: string;
  sealRuntimeUnavailable: string;
  encryptedPayloadNotFound: string;
  walletVerifiedPrivateSignalUnlocked: string;
  bulkDecryptSuccess: (unlockedCount: number) => string;
  bulkDecryptPartialSuccess: (unlockedCount: number, failedCount: number) => string;
}

const defaultDecryptMessages: DecryptMessages = {
  loadingSealRuntime: "Loading Seal runtime",
  validatingAccessPolicy: "Validating access policy",
  requestingWalletApproval: "Requesting wallet approval",
  decryptingEncryptedPayload: "Decrypting encrypted payload",
  signalUnlocked: "Signal unlocked",
  connectWalletToUnlockSignal: "Connect wallet to unlock this signal.",
  unauthorizedWalletDecrypt: "This wallet is not authorized to decrypt this response.",
  sealSessionExpired: "Seal session expired. Please re-approve.",
  walletApprovalRequiredToDecrypt: "Wallet approval is required to decrypt this response.",
  encryptionPolicyMismatch: "Encryption policy mismatch.",
  manifestMismatchDetected: "Manifest mismatch detected.",
  blobFetchFailed: "Failed to fetch encrypted payload from Walrus.",
  onchainPayloadReferenceMissing:
    "This onchain-recovered signal does not include a readable Walrus payload reference, so the private body cannot be unlocked from this inbox snapshot.",
  onchainPayloadBlobMissing:
    "This Sui-registered private signal no longer has a readable Walrus payload blob, so the private body cannot be unlocked from this inbox.",
  encryptedPayloadMissing: "Encrypted payload is missing.",
  sealRuntimeUnavailable: "Seal runtime unavailable.",
  encryptedPayloadNotFound: "Encrypted payload could not be found. Try refreshing the inbox, then unlock again.",
  walletVerifiedPrivateSignalUnlocked: "Wallet verified. Private signal unlocked.",
  bulkDecryptSuccess: (unlockedCount) => `${unlockedCount} private signals unlocked.`,
  bulkDecryptPartialSuccess: (unlockedCount, failedCount) =>
    `${unlockedCount} private signals unlocked. ${failedCount} still locked.`,
};

function isOnchainShadowWithoutReadablePayload(diagnostics?: DecryptDiagnosticContext | null) {
  return Boolean(
    diagnostics?.responseId?.startsWith("onchain:") &&
      !diagnostics.encryptedBlobId &&
      !diagnostics.submissionBlobId,
  );
}

function getFriendlyDecryptError(
  reasonCode: string,
  fallbackMessage: string,
  messages: DecryptMessages,
  diagnostics?: DecryptDiagnosticContext | null,
) {
  switch (reasonCode) {
    case "WALLET_NOT_CONNECTED":
      return messages.connectWalletToUnlockSignal;
    case "UNAUTHORIZED_WALLET":
      return messages.unauthorizedWalletDecrypt;
    case "SEAL_SESSION_EXPIRED":
      return messages.sealSessionExpired;
    case "SEAL_APPROVAL_REQUIRED":
      return messages.walletApprovalRequiredToDecrypt;
    case "POLICY_MISMATCH":
      return messages.encryptionPolicyMismatch;
    case "MANIFEST_MISMATCH":
      return messages.manifestMismatchDetected;
    case "BLOB_FETCH_FAILED":
      if (isOnchainShadowWithoutReadablePayload(diagnostics)) {
        return diagnostics?.receiptBlobId
          ? messages.onchainPayloadBlobMissing
          : messages.onchainPayloadReferenceMissing;
      }
      return messages.blobFetchFailed;
    case "ENCRYPTED_PAYLOAD_MISSING":
      if (isOnchainShadowWithoutReadablePayload(diagnostics)) {
        return messages.onchainPayloadReferenceMissing;
      }
      return messages.encryptedPayloadMissing;
    case "SEAL_RUNTIME_UNAVAILABLE":
      return messages.sealRuntimeUnavailable;
    default:
      if (fallbackMessage === SEAL_ADMIN_WALLET_REQUIRED_MESSAGE) {
        return messages.connectWalletToUnlockSignal;
      }
      if (fallbackMessage === SEAL_PERMISSION_DENIED_MESSAGE) {
        return messages.unauthorizedWalletDecrypt;
      }
      if (fallbackMessage === SEAL_WALLET_CANCELLED_MESSAGE) {
        return messages.walletApprovalRequiredToDecrypt;
      }
      return fallbackMessage;
  }
}

interface UsePrivateSignalDecryptArgs {
  accountAddress?: string | null;
  capabilityProfile: CapabilityProfile;
  ownedCapabilityObjects?: DecryptDiagnosticContext["ownedCapabilityObjects"];
  selectedRecord: SignalRecord | null;
  selectedSignalId: string;
  setToast: ToastSetter;
  decryptFailedLabel: string;
  decryptMessages?: Partial<DecryptMessages>;
}

export function usePrivateSignalDecrypt({
  accountAddress,
  capabilityProfile,
  ownedCapabilityObjects,
  selectedRecord,
  selectedSignalId,
  setToast,
  decryptFailedLabel,
  decryptMessages,
}: UsePrivateSignalDecryptArgs) {
  const messages = { ...defaultDecryptMessages, ...decryptMessages };
  const suiClient = useSuiClient();
  const signPersonalMessage = useSignPersonalMessage();
  const [detailAnswers, setDetailAnswers] = useState<Record<string, unknown> | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<Submission["attachments"]>([]);
  const [detailLegacyUnencrypted, setDetailLegacyUnencrypted] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptStatusMessage, setDecryptStatusMessage] = useState("");
  const [decryptError, setDecryptError] = useState("");
  const [decryptDiagnostics, setDecryptDiagnostics] = useState<DecryptDiagnosticContext | null>(null);
  const [decryptState, setDecryptState] = useState<PrivateSignalDecryptUiState>("locked");
  const [decryptedSignalsById, setDecryptedSignalsById] = useState<Record<string, DecryptedSignalCacheEntry>>({});
  const [bulkDecrypting, setBulkDecrypting] = useState(false);
  const [bulkDecryptStatusMessage, setBulkDecryptStatusMessage] = useState("");
  const [bulkDecryptError, setBulkDecryptError] = useState("");
  const [bulkDecryptProgress, setBulkDecryptProgress] = useState({ completed: 0, failed: 0, total: 0 });
  const decryptInFlightRef = useRef(false);
  const bulkDecryptInFlightRef = useRef(false);
  const decryptRequestIdRef = useRef(0);
  const activeDecryptRequestRef = useRef<{ requestId: number; submissionId: string } | null>(null);
  const selectedSignalIdRef = useRef(selectedSignalId);
  const previousSelectedRecordIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSignalIdRef.current = selectedRecord?.submission.id ?? selectedSignalId;
  }, [selectedRecord?.submission.id, selectedSignalId]);

  const createDecryptContextForRecord = useCallback(
    (
      record: SignalRecord,
      onStatusChange?: SealDecryptContext["onStatusChange"],
    ) => ({
      walletAddress: accountAddress ?? undefined,
      projectId: record.form.projectId,
      ownerAddress: record.form.ownerAddress,
      reviewerCapId: getReviewerCapIdForDecrypt(capabilityProfile),
      ownedCapabilityObjects,
      suiClient,
      onStatusChange,
      signPersonalMessage: async (message: Uint8Array) => {
        const result = await signPersonalMessage.mutateAsync({ message });
        return result.signature;
      },
    }),
    [accountAddress, capabilityProfile, ownedCapabilityObjects, signPersonalMessage, suiClient],
  );

  const decryptContext = useMemo(
    () =>
      selectedRecord
        ? createDecryptContextForRecord(selectedRecord)
        : {
            walletAddress: accountAddress ?? undefined,
            reviewerCapId: getReviewerCapIdForDecrypt(capabilityProfile),
            ownedCapabilityObjects,
            suiClient,
            signPersonalMessage: async (message: Uint8Array) => {
              const result = await signPersonalMessage.mutateAsync({ message });
              return result.signature;
            },
          },
    [accountAddress, capabilityProfile, createDecryptContextForRecord, ownedCapabilityObjects, selectedRecord, signPersonalMessage, suiClient],
  );

  useEffect(() => {
    if (!selectedRecord) {
      setDetailAnswers(null);
      setDetailAttachments([]);
      setDetailLegacyUnencrypted(false);
      setDecryptError("");
      setDecryptDiagnostics(null);
      setDecryptState("locked");
      if (!decryptInFlightRef.current) {
        setDecryptStatusMessage("");
      }
      previousSelectedRecordIdRef.current = null;
      return;
    }
    const previousSelectedRecordId = previousSelectedRecordIdRef.current;
    const didSelectionChange = previousSelectedRecordId !== selectedRecord.submission.id;
    previousSelectedRecordIdRef.current = selectedRecord.submission.id;
    if (didSelectionChange) {
      const cachedSignal = decryptedSignalsById[selectedRecord.submission.id];
      setDetailAnswers(
        cachedSignal
          ? cachedSignal.answers
          : selectedRecord.submission.isEncrypted
            ? null
            : selectedRecord.submission.answers,
      );
      setDetailAttachments(cachedSignal ? cachedSignal.attachments : selectedRecord.submission.attachments ?? []);
      setDetailLegacyUnencrypted(Boolean(cachedSignal?.legacyUnencrypted));
      setDecryptError("");
      setDecryptDiagnostics(null);
      setDecryptState(selectedRecord.submission.isEncrypted && !cachedSignal ? "locked" : "decrypted");
      if (!decryptInFlightRef.current) {
        setDecryptStatusMessage("");
      }
    }
  }, [decryptedSignalsById, selectedRecord]);

  function handleCancelDecrypt() {
    const activeRequest = activeDecryptRequestRef.current;
    if (!activeRequest) {
      return;
    }
    decryptRequestIdRef.current = Math.max(decryptRequestIdRef.current, activeRequest.requestId) + 1;
    activeDecryptRequestRef.current = null;
    decryptInFlightRef.current = false;
    setDecrypting(false);
    setDecryptState(detailAnswers ? "decrypted" : "locked");
    setDecryptError("");
    setDecryptDiagnostics(null);
    setDecryptStatusMessage("");
  }

  async function handleDecrypt() {
    if (!selectedRecord || decryptInFlightRef.current) {
      return;
    }
    const payloadState = getPrivateSignalPayloadState(selectedRecord.submission);
    if (payloadState !== "available") {
      setDecryptState("failed");
      setDecryptStatusMessage("");
      setDecryptDiagnostics(null);
      setDecryptError(
        payloadState === "missing_onchain_payload_reference"
          ? messages.onchainPayloadBlobMissing
          : messages.encryptedPayloadMissing,
      );
      return;
    }
    const requestId = decryptRequestIdRef.current + 1;
    decryptRequestIdRef.current = requestId;
    const submissionId = selectedRecord.submission.id;
    decryptInFlightRef.current = true;
    activeDecryptRequestRef.current = { requestId, submissionId };
    setDecrypting(true);
    setDecryptState("checking_access");
    setDecryptStatusMessage(messages.loadingSealRuntime);
    setDecryptError("");
    setDecryptDiagnostics(null);
    let unlocked = false;
    logRouteLifecycle("seal-decrypt-start", {
      formId: selectedRecord.form.id,
      submissionId,
      encryptedBlobId: selectedRecord.submission.encryptedBlobId ?? null,
      receiptBlobId: selectedRecord.submission.receiptBlobId ?? null,
    });
    try {
      const resolved = await resolveSubmissionAnswers(
        selectedRecord.form,
        selectedRecord.submission,
        undefined,
        createDecryptContextForRecord(selectedRecord, (status) => {
          const activeRequest = activeDecryptRequestRef.current;
          if (
            activeRequest?.requestId !== requestId ||
            activeRequest.submissionId !== submissionId
          ) {
            return;
          }
          setDecryptStatusMessage(getDecryptStatusMessage(status, messages));
          setDecryptState(
            status === "waiting_wallet_approval"
              ? "waiting_wallet_approval"
              : status === "signal_unlocked"
                ? "decrypted"
                : "decrypting",
          );
        }),
      );
      const isLatestRequest =
        activeDecryptRequestRef.current?.requestId === requestId &&
        activeDecryptRequestRef.current?.submissionId === submissionId;
      if (!resolved) {
        if (isLatestRequest && selectedSignalIdRef.current === submissionId) {
          setDecryptError(messages.encryptedPayloadNotFound);
        }
        return;
      }
      setDecryptedSignalsById((current) => ({
        ...current,
        [submissionId]: {
          answers: resolved.answers,
          attachments: resolved.attachments,
          legacyUnencrypted: Boolean(resolved.legacyUnencrypted),
        },
      }));
      if (resolved && isLatestRequest && selectedSignalIdRef.current === submissionId) {
        setDetailAnswers(resolved.answers);
        setDetailAttachments(resolved.attachments);
        setDetailLegacyUnencrypted(Boolean(resolved.legacyUnencrypted));
        setDecryptState("decrypted");
        setDecryptStatusMessage(messages.signalUnlocked);
        unlocked = true;
        setToast({ tone: "success", message: messages.walletVerifiedPrivateSignalUnlocked });
      }
      logRouteLifecycle("seal-decrypt-success", {
        formId: selectedRecord.form.id,
        submissionId,
        unlocked,
        hasResolvedPayload: Boolean(resolved),
      });
    } catch (error) {
      logRouteLifecycle("seal-decrypt-failure", {
        formId: selectedRecord.form.id,
        submissionId: selectedRecord.submission.id,
        error,
        decryptDiagnostics: isDecryptDiagnosticError(error) ? error.diagnostics : null,
      });
      reportSystemError({
        error,
        routePath: "/admin",
        routeId: "admin",
        severity: "error",
        sourceContext: "seal-decrypt",
        diagnostics: {
          formId: selectedRecord.form.id,
          submissionId: selectedRecord.submission.id,
          encryptedBlobId: selectedRecord.submission.encryptedBlobId ?? null,
          receiptBlobId: selectedRecord.submission.receiptBlobId ?? null,
          decryptDiagnostics: isDecryptDiagnosticError(error) ? error.diagnostics : null,
        },
      });
      const isLatestRequest =
        activeDecryptRequestRef.current?.requestId === requestId &&
        activeDecryptRequestRef.current?.submissionId === submissionId;
      if (isLatestRequest && selectedSignalIdRef.current === submissionId) {
        const reasonCode = isDecryptDiagnosticError(error)
          ? error.reasonCode
          : error instanceof Error && error.message === SEAL_PERMISSION_DENIED_MESSAGE
            ? "UNAUTHORIZED_WALLET"
            : "UNKNOWN_DECRYPT_ERROR";
        setDecryptState(
          reasonCode === "UNAUTHORIZED_WALLET" ? "unauthorized" : "failed",
        );
        setDecryptError(
          isDecryptDiagnosticError(error)
              ? getFriendlyDecryptError(error.reasonCode, error.message, messages, error.diagnostics)
              : error instanceof Error
                ? getFriendlyDecryptError(reasonCode, error.message, messages)
                : decryptFailedLabel,
        );
        setDecryptDiagnostics(isDecryptDiagnosticError(error) ? error.diagnostics : null);
      }
    } finally {
      const isLatestRequest =
        activeDecryptRequestRef.current?.requestId === requestId &&
        activeDecryptRequestRef.current?.submissionId === submissionId;
      if (isLatestRequest) {
        activeDecryptRequestRef.current = null;
      }
      decryptInFlightRef.current = false;
      setDecrypting(false);
      if (activeDecryptRequestRef.current === null && !unlocked) {
        setDecryptStatusMessage("");
      }
    }
  }

  async function handleDecryptRecords(records: SignalRecord[]) {
    if (bulkDecryptInFlightRef.current || decryptInFlightRef.current) {
      return { unlockedCount: 0, failedCount: 0, totalCount: 0, unlockedSignalsById: {} };
    }

    const targets = records.filter(
      (record) => record.submission.isEncrypted && !decryptedSignalsById[record.submission.id],
    );
    const decryptableTargets = targets.filter(
      (record) => getPrivateSignalPayloadState(record.submission) === "available",
    );
    if (decryptableTargets.length === 0) {
      setBulkDecryptStatusMessage("");
      setBulkDecryptError(targets.length > 0 ? messages.onchainPayloadBlobMissing : "");
      setBulkDecryptProgress({ completed: 0, failed: 0, total: 0 });
      return { unlockedCount: 0, failedCount: 0, totalCount: 0, unlockedSignalsById: {} };
    }

    bulkDecryptInFlightRef.current = true;
    setBulkDecrypting(true);
    setBulkDecryptError("");
    setBulkDecryptProgress({ completed: 0, failed: 0, total: decryptableTargets.length });

    let unlockedCount = 0;
    let failedCount = 0;
    let firstError = "";
    const unlockedSignalsById: Record<string, DecryptedSignalCacheEntry> = {};

    logRouteLifecycle("seal-bulk-decrypt-start", {
      requestedCount: records.length,
      decryptableCount: decryptableTargets.length,
    });
    try {
      for (const [index, record] of decryptableTargets.entries()) {
        const position = index + 1;
        setBulkDecryptStatusMessage(`${messages.decryptingEncryptedPayload} (${position}/${decryptableTargets.length})`);
        try {
          const resolved = await resolveSubmissionAnswers(
            record.form,
            record.submission,
            undefined,
            createDecryptContextForRecord(record, (status) => {
              setBulkDecryptStatusMessage(
                `${getDecryptStatusMessage(status, messages)} (${position}/${decryptableTargets.length})`,
              );
            }),
          );
          if (!resolved) {
            failedCount += 1;
            firstError = firstError || messages.encryptedPayloadNotFound;
            setBulkDecryptProgress({ completed: unlockedCount, failed: failedCount, total: decryptableTargets.length });
            continue;
          }
          unlockedCount += 1;
          const cacheEntry = {
            answers: resolved.answers,
            attachments: resolved.attachments,
            legacyUnencrypted: Boolean(resolved.legacyUnencrypted),
          };
          unlockedSignalsById[record.submission.id] = cacheEntry;
          setDecryptedSignalsById((current) => ({
            ...current,
            [record.submission.id]: cacheEntry,
          }));
          if (selectedSignalIdRef.current === record.submission.id) {
            setDetailAnswers(cacheEntry.answers);
            setDetailAttachments(cacheEntry.attachments);
            setDetailLegacyUnencrypted(cacheEntry.legacyUnencrypted);
            setDecryptState("decrypted");
            setDecryptStatusMessage(messages.signalUnlocked);
          }
          setBulkDecryptProgress({ completed: unlockedCount, failed: failedCount, total: decryptableTargets.length });
        } catch (error) {
          logRouteLifecycle("seal-bulk-decrypt-failure", {
            formId: record.form.id,
            submissionId: record.submission.id,
            position,
            error,
            decryptDiagnostics: isDecryptDiagnosticError(error) ? error.diagnostics : null,
          });
          reportSystemError({
            error,
            routePath: "/admin",
            routeId: "admin",
            severity: "error",
            sourceContext: "seal-bulk-decrypt",
            diagnostics: {
              formId: record.form.id,
              submissionId: record.submission.id,
              encryptedBlobId: record.submission.encryptedBlobId ?? null,
              receiptBlobId: record.submission.receiptBlobId ?? null,
              decryptDiagnostics: isDecryptDiagnosticError(error) ? error.diagnostics : null,
            },
          });
          failedCount += 1;
          const reasonCode = isDecryptDiagnosticError(error)
            ? error.reasonCode
            : error instanceof Error && error.message === SEAL_PERMISSION_DENIED_MESSAGE
              ? "UNAUTHORIZED_WALLET"
              : "UNKNOWN_DECRYPT_ERROR";
          firstError =
            firstError ||
            (isDecryptDiagnosticError(error)
              ? getFriendlyDecryptError(error.reasonCode, error.message, messages, error.diagnostics)
              : error instanceof Error
                ? getFriendlyDecryptError(reasonCode, error.message, messages)
                : decryptFailedLabel);
          setBulkDecryptProgress({ completed: unlockedCount, failed: failedCount, total: decryptableTargets.length });
        }
      }
    } finally {
      bulkDecryptInFlightRef.current = false;
      setBulkDecrypting(false);
    }

    logRouteLifecycle(failedCount > 0 ? "seal-bulk-decrypt-failure" : "seal-bulk-decrypt-success", {
      unlockedCount,
      failedCount,
      totalCount: decryptableTargets.length,
    });

    if (failedCount > 0) {
      setBulkDecryptError(firstError || decryptFailedLabel);
      setToast({
        tone: unlockedCount > 0 ? "success" : "error",
        message:
          unlockedCount > 0
            ? messages.bulkDecryptPartialSuccess(unlockedCount, failedCount)
            : firstError || decryptFailedLabel,
      });
    } else {
      setBulkDecryptError("");
      setToast({
        tone: "success",
        message: messages.bulkDecryptSuccess(unlockedCount),
      });
    }
    setBulkDecryptStatusMessage("");

    return { unlockedCount, failedCount, totalCount: decryptableTargets.length, unlockedSignalsById };
  }

  return {
    detailAnswers,
    setDetailAnswers,
    detailAttachments,
    setDetailAttachments,
    detailLegacyUnencrypted,
    decrypting,
    decryptState,
    decryptStatusMessage,
    decryptError,
    decryptDiagnostics,
    setDecryptError,
    setDecryptDiagnostics,
    setDecryptStatusMessage,
    decryptedSignalsById,
    bulkDecrypting,
    bulkDecryptStatusMessage,
    bulkDecryptError,
    bulkDecryptProgress,
    decryptInFlightRef,
    bulkDecryptInFlightRef,
    activeDecryptSubmissionId: activeDecryptRequestRef.current?.submissionId ?? null,
    decryptContext,
    handleDecrypt,
    handleDecryptRecords,
    handleCancelDecrypt,
    realSealSessionTtlMinutes: REAL_SEAL_SESSION_TTL_MIN,
  };
}
