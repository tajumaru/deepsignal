import { useMemo, useState } from "react";
import { SignalMetaChip } from "./SignalMetaChip";
import { useI18n } from "../i18n";
import {
  getCurrentWalrusNetwork,
  getWalrusExplorerUrl,
  shortenWalrusBlobId,
  verifyWalrusBlob,
  type WalrusVerificationStatus,
} from "../lib/walrusProof";
import { isLocalFallbackBlob } from "../lib/signalInbox";
import type { WalrusBlobProof } from "../types";

interface StorageProofProps {
  blobId?: string | null;
  proof?: WalrusBlobProof | null;
  label?: string;
  fallbackSize?: number;
  compact?: boolean;
}

function formatBytes(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getVerificationLabel(
  status: WalrusVerificationStatus,
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (status) {
    case "verifying":
      return t("storageProofVerifying");
    case "verified":
      return t("storageProofVerified");
    case "not-found":
      return t("storageProofNotFound");
    case "failed":
      return t("storageProofFailed");
    case "idle":
    default:
      return t("storageProofVerifyUpload");
  }
}

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="storage-proof-icon">
      <path
        d="M8.25 7.25H6.5A2.5 2.5 0 0 0 4 9.75v7.75A2.5 2.5 0 0 0 6.5 20h7.75a2.5 2.5 0 0 0 2.5-2.5v-1.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M13 4h7v7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m11 13 8.5-8.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function VerifyIcon({ status }: { status: WalrusVerificationStatus }) {
  if (status === "verifying") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="storage-proof-icon storage-proof-icon-spin">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path
          d="M20 12a8 8 0 0 0-8-8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (status === "verified") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="storage-proof-icon">
        <path
          d="M12 3.5 19 6v5.25c0 4.35-2.95 7.45-7 9.25-4.05-1.8-7-4.9-7-9.25V6l7-2.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="m8.75 12.1 2.1 2.1 4.55-4.7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  if (status === "not-found" || status === "failed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="storage-proof-icon">
        <path
          d="M12 3.5 19 6v5.25c0 4.35-2.95 7.45-7 9.25-4.05-1.8-7-4.9-7-9.25V6l7-2.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="m9.4 9.4 5.2 5.2M14.6 9.4l-5.2 5.2"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="storage-proof-icon">
      <path
        d="M12 3.5 19 6v5.25c0 4.35-2.95 7.45-7 9.25-4.05-1.8-7-4.9-7-9.25V6l7-2.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 8v4.25l2.6 1.55"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function StorageProof({
  blobId,
  proof,
  label = "Storage proof",
  fallbackSize,
  compact = false,
}: StorageProofProps) {
  const { t } = useI18n();
  const resolvedBlobId = proof?.blobId ?? blobId ?? "";
  const [verificationStatus, setVerificationStatus] = useState<WalrusVerificationStatus>("idle");
  const network = proof?.network ?? getCurrentWalrusNetwork();
  const explorerUrl = getWalrusExplorerUrl(resolvedBlobId, network);
  const sizeLabel = formatBytes(proof?.size ?? fallbackSize);
  const isWalrusBlob = Boolean(resolvedBlobId && !isLocalFallbackBlob(resolvedBlobId));
  const verificationLabel = getVerificationLabel(verificationStatus, t);

  const metadata = useMemo(
    () =>
      [
        proof?.objectId ? `object ${shortenWalrusBlobId(proof.objectId)}` : null,
        sizeLabel,
        typeof proof?.epoch === "number" ? `${proof.epoch} epochs` : null,
      ].filter((item): item is string => Boolean(item)),
    [proof?.epoch, proof?.objectId, sizeLabel],
  );

  if (!resolvedBlobId || !isWalrusBlob) {
    return null;
  }

  async function handleVerify() {
    setVerificationStatus("verifying");
    setVerificationStatus(await verifyWalrusBlob(resolvedBlobId));
  }

  return (
    <section className={`storage-proof ${compact ? "storage-proof-compact" : ""}`.trim()}>
      <div className="storage-proof-header">
        <div className="storage-proof-title">
          <span>{label}</span>
          <SignalMetaChip type="blob" value={resolvedBlobId} />
        </div>
        <span className="storage-proof-network">
          <span>{network}</span>
          <span className="storage-proof-network-dot" aria-hidden="true" />
        </span>
      </div>
      {metadata.length > 0 ? (
        <div className="storage-proof-meta">
          {metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
      <div className="storage-proof-actions">
        {explorerUrl ? (
          <a
            className="ghost-button storage-proof-button"
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("storageProofOpenExplorer")}
            title={t("storageProofOpenExplorer")}
          >
            <ExplorerIcon />
            <span className="sr-only">{t("storageProofOpenExplorer")}</span>
          </a>
        ) : null}
        <button
          type="button"
          className="ghost-button storage-proof-button"
          onClick={() => void handleVerify()}
          disabled={verificationStatus === "verifying"}
          aria-label={verificationLabel}
          title={verificationLabel}
        >
          <VerifyIcon status={verificationStatus} />
          <span className="sr-only">{verificationLabel}</span>
        </button>
      </div>
      {verificationStatus !== "idle" ? (
        <span className={`storage-proof-verification-status is-${verificationStatus}`} aria-live="polite">
          {verificationLabel}
        </span>
      ) : null}
    </section>
  );
}
