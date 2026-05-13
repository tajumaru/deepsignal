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
import type { CapabilityProfile } from "../../../hooks/useAccessControl";
import { resolveSubmissionAnswers } from "../../../lib/storage";
import type { Submission } from "../../../types";
import type { SignalRecord } from "./useSignalInboxData";

type ToastSetter = (toast: { tone: "success" | "error"; message: string } | null) => void;

function getDecryptStatusMessage(
  status: "waiting_wallet_approval" | "decrypting_private_signal" | "finishing",
) {
  switch (status) {
    case "waiting_wallet_approval":
      return "Waiting for wallet approval...";
    case "decrypting_private_signal":
      return "Decrypting private signal...";
    case "finishing":
      return "Finishing...";
  }
}

function getFriendlyDecryptError(message: string) {
  if (message === SEAL_ADMIN_WALLET_REQUIRED_MESSAGE) {
    return "Connect an authorized reviewer wallet to decrypt this private signal.";
  }
  if (message === SEAL_PERMISSION_DENIED_MESSAGE) {
    return "This wallet is not authorized for this project.";
  }
  if (message === SEAL_WALLET_CANCELLED_MESSAGE) {
    return "Wallet approval was cancelled.";
  }
  return message;
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
  const [decrypting, setDecrypting] = useState(false);
  const [decryptStatusMessage, setDecryptStatusMessage] = useState("");
  const [decryptError, setDecryptError] = useState("");
  const decryptInFlightRef = useRef(false);
  const decryptRequestIdRef = useRef(0);
  const activeDecryptRequestRef = useRef<{ requestId: number; submissionId: string } | null>(null);
  const selectedSignalIdRef = useRef(selectedSignalId);
  const previousSelectedRecordIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSignalIdRef.current = selectedSignalId;
  }, [selectedSignalId]);

  const decryptContext = useMemo(
    () => ({
      walletAddress: accountAddress ?? undefined,
      projectId: selectedRecord?.form.projectId,
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
    [accountAddress, capabilityProfile, selectedRecord?.form.projectId, signPersonalMessage, suiClient],
  );

  useEffect(() => {
    if (!selectedRecord) {
      setDetailAnswers(null);
      setDetailAttachments([]);
      setDecryptError("");
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
      setDecryptError("");
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
    setDecryptStatusMessage("Waiting for wallet approval...");
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
          },
        },
      );
      const isLatestRequest =
        activeDecryptRequestRef.current?.requestId === requestId &&
        activeDecryptRequestRef.current?.submissionId === submissionId;
      if (resolved && isLatestRequest && selectedSignalIdRef.current === submissionId) {
        setDetailAnswers(resolved.answers);
        setDetailAttachments(resolved.attachments);
        setToast({ tone: "success", message: "Wallet verified. Private signal unlocked." });
      }
    } catch (error) {
      const isLatestRequest =
        activeDecryptRequestRef.current?.requestId === requestId &&
        activeDecryptRequestRef.current?.submissionId === submissionId;
      if (isLatestRequest && selectedSignalIdRef.current === submissionId) {
        setDecryptError(
          error instanceof Error ? getFriendlyDecryptError(error.message) : decryptFailedLabel,
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
      setDecryptStatusMessage("");
    }
  }

  return {
    detailAnswers,
    setDetailAnswers,
    detailAttachments,
    setDetailAttachments,
    decrypting,
    decryptStatusMessage,
    decryptError,
    setDecryptError,
    decryptInFlightRef,
    decryptContext,
    handleDecrypt,
    realSealSessionTtlMinutes: REAL_SEAL_SESSION_TTL_MIN,
  };
}
