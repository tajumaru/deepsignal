import { useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { PublicSignalMetaChip, PublicSignalMetaRow } from "../../../components/PublicSignalMeta";
import { PublicStorageProof } from "../../../components/PublicStorageProof";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../../../lib/encryptionDisplay";
import { useRpcInfrastructure } from "../../../rpcInfrastructure";
import { getCurrentWalrusNetwork } from "../../../lib/walrusProof";
import { getSubmissionRespondentMeta } from "../../../lib/respondentMeta";
import type { Submission } from "../../../types";

interface PublicFormSuccessProps {
  submitted: Submission;
  submitNotice: string;
  notAvailableLabel: string;
  pendingSuiRegistrationLabel: string;
  signalReceivedLabel: string;
  thanksForFeedbackLabel: string;
}

function isPublicLocalFallbackBlob(blobId?: string | null) {
  if (!blobId) {
    return false;
  }
  return (
    blobId.startsWith("local-") ||
    blobId.startsWith("todo-") ||
    blobId.startsWith("walrus-form-") ||
    blobId.startsWith("walrus-submission-") ||
    blobId.startsWith("walrus-file-")
  );
}

export function PublicFormSuccess({
  submitted,
  submitNotice,
  notAvailableLabel,
  pendingSuiRegistrationLabel,
  signalReceivedLabel,
}: PublicFormSuccessProps) {
  const location = useLocation();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const rpc = useRpcInfrastructure();
  const submittedRespondentMeta = getSubmissionRespondentMeta(submitted);
  const isEncryptedSubmission = Boolean(submitted.isEncrypted);
  const primaryBlobId = submitted.encryptedBlobId ?? submitted.blobId;
  const storedOnWalrus = Boolean(primaryBlobId && !isPublicLocalFallbackBlob(primaryBlobId));
  const remoteDelivered =
    submitted.remoteSyncStatus === "remote_synced" &&
    submitted.remoteIndexUpdated === true &&
    submitted.remoteIndexReadBack === true &&
    submitted.ownerReadable === true;
  const evidenceBlobId = submitted.encryptedBlobId ?? submitted.blobId;
  const networkLabel = storedOnWalrus ? getCurrentWalrusNetwork() : "local";
  const providerDetailLabel = rpc.usingTatum ? "Powered by Tatum" : rpc.providerLabel;
  const receiptJson = useMemo(() => JSON.stringify(submitted, null, 2), [submitted]);
  const submitAnotherHref = `${location.pathname}${location.search}`;
  const myResponseDetailHref = `/my-responses/${submitted.id}`;

  function openTechnicalDetails() {
    if (!detailsRef.current) {
      return;
    }
    detailsRef.current.open = true;
    detailsRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <section className="stack">
      <section className="panel glow-panel success-screen signal-success-scene">
        <div className="signal-success-hero">
          <p className="eyebrow">{signalReceivedLabel}</p>
          <h1>Your report has been sealed.</h1>
          <p className="lede">
            {!remoteDelivered
              ? "Your signal is safely stored. Inbox synchronization will retry automatically."
              : isEncryptedSubmission
              ? "Authorized reviewers can decrypt and review this signal."
              : "Authorized reviewers can review this signal."}
          </p>
          {!remoteDelivered && submitNotice ? <p className="muted">{submitNotice}</p> : null}
        </div>

        <div className="signal-success-actions" aria-label="Next actions">
          <Link to="/explore" className="primary-button signal-success-action">
            Return to Signals
          </Link>
          <Link to={myResponseDetailHref} className="ghost-button signal-success-action">
            Track Lifecycle
          </Link>
          {remoteDelivered ? (
            <Link to={submitAnotherHref} className="ghost-button signal-success-action">
              Submit Another Signal
            </Link>
          ) : null}
          <button type="button" className="ghost-button signal-success-action" onClick={openTechnicalDetails}>
            View Receipt
          </button>
        </div>
        <p className="muted signal-success-history-note">
          A local read-only receipt was saved on this device. Open the lifecycle timeline to follow this signal as it
          moves through Inbox review, roadmap planning, and completion. Anonymous submission history exists only in this
          browser storage.
        </p>

        <details ref={detailsRef} className="answer-card public-submit-details signal-success-details">
          <summary>
            <span>
              <p className="eyebrow">Technical details</p>
              <h3>Receipt and verification data</h3>
            </span>
          </summary>
          <div className="metadata-list">
            <div className="metadata-row">
              <span>Storage status</span>
              <strong>{storedOnWalrus ? "Certified by Walrus" : "Stored locally"}</strong>
            </div>
            <div className="metadata-row">
              <span>Verification status</span>
              <strong>{remoteDelivered ? "Owner-readable" : "Sync pending"}</strong>
            </div>
            {submitted.remoteIndexTarget ? (
              <PublicSignalMetaRow label="Remote index" type="manifest" value={submitted.remoteIndexBlobId ?? submitted.remoteIndexTarget} />
            ) : null}
            <div className="metadata-row">
              <span>Network</span>
              <strong>{networkLabel}</strong>
            </div>
            <div className="metadata-row">
              <span>Provider</span>
              <strong>{providerDetailLabel}</strong>
            </div>
            {submitted.receiptBlobId ? (
              <PublicSignalMetaRow label="Recovery Path" type="blob" value={submitted.receiptBlobId} />
            ) : null}
            {submitted.onchainSignalId !== undefined ? (
              <div className="metadata-row">
                <span>Submission receipt</span>
                <strong>{submitted.onchainSignalId}</strong>
              </div>
            ) : null}
            <PublicSignalMetaRow label="Blob ID" type="blob" value={submitted.blobId}>
              <PublicStorageProof blobId={submitted.blobId} proof={submitted.walrusProof} compact />
            </PublicSignalMetaRow>
            {hasDedicatedEncryptedPayloadBlob(submitted) ? (
              <PublicSignalMetaRow label="Encrypted evidence blob" type="seal" value={submitted.encryptedBlobId}>
                <PublicStorageProof
                  blobId={submitted.encryptedBlobId}
                  proof={submitted.encryptedWalrusProof ?? submitted.walrusProof}
                  compact
                />
              </PublicSignalMetaRow>
            ) : null}
            {submitted.isEncrypted && !hasDedicatedEncryptedPayloadBlob(submitted) ? (
              <div className="metadata-row">
                <span>Encrypted payload</span>
                <strong>{getEncryptedPayloadAvailabilityLabel(submitted)}</strong>
              </div>
            ) : null}
            <PublicSignalMetaRow label="Seal Identity" type="seal" value={submitted.sealIdentity} emptyLabel={notAvailableLabel} />
            <div className="metadata-row">
              <span>Submission mode</span>
              <strong>{submittedRespondentMeta.isAnonymous ? "Anonymous" : "Wallet verified"}</strong>
            </div>
            {submitted.pendingOnchainRegistration ? (
              <div className="metadata-row">
                <span>Sui registration</span>
                <strong>{pendingSuiRegistrationLabel}</strong>
              </div>
            ) : null}
            <div className="metadata-row signal-meta-row">
              <span>Evidence attachments</span>
              <div className="stack signal-meta-row-value">
                {submitted.attachments.length === 0 ? (
                  <strong>Not available</strong>
                ) : (
                  submitted.attachments.map((attachment, index) => (
                    <div key={attachment.blobId} className="signal-meta-row-value">
                      <span>Attachment {index + 1}</span>
                      {attachment.storage === "inline" ? (
                        <strong>Embedded in private signal</strong>
                      ) : (
                        <>
                          <PublicSignalMetaChip type="blob" value={attachment.blobId} />
                          <div className="signal-meta-row-value">
                            <PublicStorageProof
                              blobId={attachment.blobId}
                              proof={attachment.walrusProof}
                              fallbackSize={attachment.size}
                              compact
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            {storedOnWalrus && evidenceBlobId ? (
              <div className="metadata-row signal-success-proof-row">
                <span>Verification proof</span>
                <div className="signal-meta-row-value">
                  <PublicStorageProof
                    blobId={evidenceBlobId}
                    proof={submitted.encryptedWalrusProof ?? submitted.walrusProof}
                    label="Evidence proof"
                  />
                </div>
              </div>
            ) : null}
            <div className="metadata-row signal-success-raw-receipt">
              <span>Raw receipt data</span>
              <pre>{receiptJson}</pre>
            </div>
          </div>
        </details>
      </section>
    </section>
  );
}
