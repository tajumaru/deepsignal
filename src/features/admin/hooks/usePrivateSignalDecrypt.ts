import {
  useSignPersonalMessage,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  REAL_SEAL_SESSION_TTL_MIN,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_WALLET_CANCELLED_MESSAGE,
} from "../../../crypto/sealPayload";
import { isDecryptDiagnosticError, type DecryptDiagnosticContext } from "../../../crypto/decryptDiagnostics";
import type { CapabilityProfile } from "../../../hooks/useAccessControl";
import { resolveSubmissionAnswers } from "../../../lib/storage";
import type { Submission } from "../../../types";
import type { SignalRecord } from "./useSignalInboxData";

type ToastSetter = (toast: { tone: "success" | "error"; message: string } | null) => void;

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
  encryptedPayloadMissing: string;
  sealRuntimeUnavailable: string;
  encryptedPayloadNotFound: string;
  walletVerifiedPrivateSignalUnlocked: string;
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
  encryptedPayloadMissing: "Encrypted payload is missing.",
  sealRuntimeUnavailable: "Seal runtime unavailable.",
  encryptedPayloadNotFound: "Encrypted payload could not be found. Try refreshing the inbox, then unlock again.",
  walletVerifiedPrivateSignalUnlocked: "Wallet verified. Private signal unlocked.",
};

function getFriendlyDecryptError(reasonCode: string, fallbackMessage: string, messages: DecryptMessages) {
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
      return messages.blobFetchFailed;
    case "ENCRYPTED_PAYLOAD_MISSING":
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
  const decryptInFlightRef = useRef(false);
  const decryptRequestIdRef = useRef(0);
  const activeDecryptRequestRef = useRef<{ requestId: number; submissionId: string } | null>(null);
  const selectedSignalIdRef = useRef(selectedSignalId);
  const previousSelectedRecordIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSignalIdRef.current = selectedRecord?.submission.id ?? selectedSignalId;
  }, [selectedRecord?.submission.id, selectedSignalId]);

  const decryptContext = useMemo(
    () => ({
      walletAddress: accountAddress ?? undefined,
      projectId: selectedRecord?.form.projectId,
      ownerAddress: selectedRecord?.form.ownerAddress,
      reviewerCapId:
        capabilityProfile.hasOwnerCap || capabilityProfile.hasAdminCap
          ? undefined
          : capabilityProfile.reviewerCapIds[0],
      ownedCapabilityObjects,
      suiClient,
      signPersonalMessage: async (message: Uint8Array) => {
        const result = await signPersonalMessage.mutateAsync({ message });
        return result.signature;
      },
    }),
    [accountAddress, capabilityProfile, ownedCapabilityObjects, selectedRecord?.form.ownerAddress, selectedRecord?.form.projectId, signPersonalMessage, suiClient],
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
      setDetailAnswers(
        selectedRecord.submission.isEncrypted ? null : selectedRecord.submission.answers,
      );
      setDetailAttachments(selectedRecord.submission.attachments ?? []);
      setDetailLegacyUnencrypted(false);
      setDecryptError("");
      setDecryptDiagnostics(null);
      setDecryptState(selectedRecord.submission.isEncrypted ? "locked" : "decrypted");
      if (!decryptInFlightRef.current) {
        setDecryptStatusMessage("");
      }
    }
  }, [selectedRecord]);

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
    try {
      const resolved = await resolveSubmissionAnswers(
        selectedRecord.form,
        selectedRecord.submission,
        undefined,
        {
          ...decryptContext,
          onStatusChange: (status) => {
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
          },
        },
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
      if (resolved && isLatestRequest && selectedSignalIdRef.current === submissionId) {
        setDetailAnswers(resolved.answers);
        setDetailAttachments(resolved.attachments);
        setDetailLegacyUnencrypted(Boolean(resolved.legacyUnencrypted));
        setDecryptState("decrypted");
        setDecryptStatusMessage(messages.signalUnlocked);
        unlocked = true;
        setToast({ tone: "success", message: messages.walletVerifiedPrivateSignalUnlocked });
      }
    } catch (error) {
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
            ? getFriendlyDecryptError(error.reasonCode, error.message, messages)
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
    decryptInFlightRef,
    activeDecryptSubmissionId: activeDecryptRequestRef.current?.submissionId ?? null,
    decryptContext,
    handleDecrypt,
    handleCancelDecrypt,
    realSealSessionTtlMinutes: REAL_SEAL_SESSION_TTL_MIN,
  };
}
