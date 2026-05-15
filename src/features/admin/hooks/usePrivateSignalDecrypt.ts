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
import { isDecryptDiagnosticError } from "../../../crypto/decryptDiagnostics";
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
) {
  switch (status) {
    case "loading_seal_runtime":
      return "Loading Seal runtime";
    case "validating_access_policy":
      return "Validating access policy";
    case "waiting_wallet_approval":
      return "Requesting wallet approval";
    case "decrypting_encrypted_payload":
      return "Decrypting encrypted payload";
    case "signal_unlocked":
      return "Signal unlocked";
  }
}

function getFriendlyDecryptError(reasonCode: string, fallbackMessage: string) {
  switch (reasonCode) {
    case "WALLET_NOT_CONNECTED":
      return "Connect wallet to unlock this signal.";
    case "UNAUTHORIZED_WALLET":
      return "This wallet is not authorized to decrypt this response.";
    case "SEAL_SESSION_EXPIRED":
      return "Seal session expired. Please re-approve.";
    case "SEAL_APPROVAL_REQUIRED":
      return "Wallet approval is required to decrypt this response.";
    case "POLICY_MISMATCH":
      return "Encryption policy mismatch.";
    case "MANIFEST_MISMATCH":
      return "Manifest mismatch detected.";
    case "BLOB_FETCH_FAILED":
      return "Failed to fetch encrypted payload from Walrus.";
    case "ENCRYPTED_PAYLOAD_MISSING":
      return "Encrypted payload is missing.";
    case "SEAL_RUNTIME_UNAVAILABLE":
      return "Seal runtime unavailable.";
    default:
      if (fallbackMessage === SEAL_ADMIN_WALLET_REQUIRED_MESSAGE) {
        return "Connect wallet to unlock this signal.";
      }
      if (fallbackMessage === SEAL_PERMISSION_DENIED_MESSAGE) {
        return "This wallet is not authorized to decrypt this response.";
      }
      if (fallbackMessage === SEAL_WALLET_CANCELLED_MESSAGE) {
        return "Wallet approval is required to decrypt this response.";
      }
      return fallbackMessage;
  }
}

interface UsePrivateSignalDecryptArgs {
  accountAddress?: string | null;
  capabilityProfile: CapabilityProfile;
  selectedRecord: SignalRecord | null;
  selectedSignalId: string;
  setToast: ToastSetter;
  decryptFailedLabel: string;
}

export function usePrivateSignalDecrypt({
  accountAddress,
  capabilityProfile,
  selectedRecord,
  selectedSignalId,
  setToast,
  decryptFailedLabel,
}: UsePrivateSignalDecryptArgs) {
  const suiClient = useSuiClient();
  const signPersonalMessage = useSignPersonalMessage();
  const [detailAnswers, setDetailAnswers] = useState<Record<string, unknown> | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<Submission["attachments"]>([]);
  const [detailLegacyUnencrypted, setDetailLegacyUnencrypted] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptStatusMessage, setDecryptStatusMessage] = useState("");
  const [decryptError, setDecryptError] = useState("");
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
      suiClient,
      signPersonalMessage: async (message: Uint8Array) => {
        const result = await signPersonalMessage.mutateAsync({ message });
        return result.signature;
      },
    }),
    [accountAddress, capabilityProfile, selectedRecord?.form.ownerAddress, selectedRecord?.form.projectId, signPersonalMessage, suiClient],
  );

  useEffect(() => {
    if (!selectedRecord) {
      setDetailAnswers(null);
      setDetailAttachments([]);
      setDetailLegacyUnencrypted(false);
      setDecryptError("");
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
      setDecryptState(selectedRecord.submission.isEncrypted ? "locked" : "decrypted");
      if (!decryptInFlightRef.current) {
        setDecryptStatusMessage("");
      }
    }
  }, [selectedRecord]);

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
    setDecryptStatusMessage("Loading Seal runtime");
    setDecryptError("");
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
            setDecryptStatusMessage(getDecryptStatusMessage(status));
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
          setDecryptError("Encrypted payload could not be found. Try refreshing the inbox, then unlock again.");
        }
        return;
      }
      if (resolved && isLatestRequest && selectedSignalIdRef.current === submissionId) {
        setDetailAnswers(resolved.answers);
        setDetailAttachments(resolved.attachments);
        setDetailLegacyUnencrypted(Boolean(resolved.legacyUnencrypted));
        setDecryptState("decrypted");
        setDecryptStatusMessage("Signal unlocked");
        setToast({ tone: "success", message: "Wallet verified. Private signal unlocked." });
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
            ? getFriendlyDecryptError(error.reasonCode, error.message)
            : error instanceof Error
              ? getFriendlyDecryptError(reasonCode, error.message)
              : decryptFailedLabel,
        );
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
      if (activeDecryptRequestRef.current === null && decryptState !== "decrypted") {
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
    setDecryptError,
    decryptInFlightRef,
    decryptContext,
    handleDecrypt,
    realSealSessionTtlMinutes: REAL_SEAL_SESSION_TTL_MIN,
  };
}
