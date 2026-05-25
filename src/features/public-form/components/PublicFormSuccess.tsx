import { useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { SignalMetaChip, SignalMetaRow } from "../../../components/SignalMetaChip";
import { FlowStepIcon } from "../../../components/SignalFlowIcons";
import { StorageProof } from "../../../components/StorageProof";
import { TatumFrogIcon } from "../../../components/NetworkMenu";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../../../lib/encryptionDisplay";
import { useRpcInfrastructure } from "../../../rpcInfrastructure";
import { getCurrentWalrusNetwork } from "../../../lib/walrusProof";
import { getSubmissionRespondentMeta } from "../../../lib/respondentMeta";
import { getStorageDetailLabels, isLocalFallbackBlob } from "../../../lib/signalInbox";
import type { Submission } from "../../../types";

interface PublicFormSuccessProps {
  submitted: Submission;
  submitNotice: string;
  notAvailableLabel: string;
  pendingSuiRegistrationLabel: string;
  signalReceivedLabel: string;
  thanksForFeedbackLabel: string;
}

export function PublicFormSuccess({
  submitted,
  submitNotice,
  notAvailableLabel,
  pendingSuiRegistrationLabel,
  signalReceivedLabel,
  thanksForFeedbackLabel,
}: PublicFormSuccessProps) {
  const location = useLocation();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const rpc = useRpcInfrastructure();
  const storageLabels = getStorageDetailLabels(submitted.encryptedBlobId ?? submitted.blobId);
  const submittedRespondentMeta = getSubmissionRespondentMeta(submitted);
  const isEncryptedSubmission = Boolean(submitted.isEncrypted);
  const primaryBlobId = submitted.encryptedBlobId ?? submitted.blobId;
  const storedOnWalrus = Boolean(primaryBlobId && !isLocalFallbackBlob(primaryBlobId));
  const evidenceBlobId = submitted.encryptedBlobId ?? submitted.blobId;
  const networkLabel = storedOnWalrus ? getCurrentWalrusNetwork() : "local";
  const providerBadgeLabel = rpc.usingTatum ? "Powered by Tatum" : "Sui RPC connected";
  const providerDetailLabel = rpc.usingTatum ? "Powered by Tatum" : rpc.providerLabel;
  const receiptJson = useMemo(() => JSON.stringify(submitted, null, 2), [submitted]);
  const submitAnotherHref = `${location.pathname}${location.search}`;
  const trustLabel = storedOnWalrus ? "Certified by Walrus" : "Stored locally. Remote certification unavailable.";
  const trustToneClass = storedOnWalrus ? "is-certified" : "is-warning";

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
            {isEncryptedSubmission
              ? "Authorized reviewers can decrypt and review this signal."
              : "Authorized reviewers can review this signal."}
          </p>
        </div>

        <div className="signal-success-status-row" role="list" aria-label="Signal delivery status">
          <div className="signal-success-status-chip is-complete" role="listitem" title="Submission encryption complete">
            <FlowStepIcon name="Encrypt" />
            <strong>Encrypted</strong>
          </div>
          <div
            className={`signal-success-status-chip ${storedOnWalrus ? "is-complete" : "is-warning"}`}
            role="listitem"
            title={storedOnWalrus ? "Saved to Walrus storage" : "Saved with local recovery fallback"}
          >
            <FlowStepIcon name="Store" />
            <strong>Saved</strong>
          </div>
          <div
            className={`signal-success-status-chip ${storedOnWalrus ? "is-complete" : "is-warning"}`}
            role="listitem"
            title={storedOnWalrus ? "Verification path ready" : "Recovery path ready"}
          >
            <FlowStepIcon name="Certify" />
            <strong>Verifiable</strong>
          </div>
        </div>

        <section className={`signal-success-trust-strip ${trustToneClass}`} aria-label="Trust confirmation">
          <div className="signal-success-trust-brand">
            <TatumFrogIcon className="signal-success-trust-icon" />
            <span>{trustLabel}</span>
          </div>
          <div className="signal-success-trust-badges">
            <span className="signal-chip signal-chip-soft">{providerBadgeLabel}</span>
            <span className="signal-chip signal-chip-soft">
              {storedOnWalrus ? "Walrus evidence layer" : "Protected recovery path"}
            </span>
          </div>
        </section>

        <div className="signal-success-footer">
          <p className="muted">{thanksForFeedbackLabel}</p>
          {submitNotice ? <p className="muted">{submitNotice}</p> : null}
          {!storedOnWalrus
            ? storageLabels
                .filter((label) => label !== "Stored locally only")
                .map((label) => (
                  <p key={label} className="muted signal-success-subtle-note">
                    {label === "Walrus upload failed or not configured"
                      ? "Remote certification is currently unavailable."
                      : label}
                  </p>
                ))
            : null}
        </div>

        <div className="signal-success-actions" aria-label="Next actions">
          <Link to="/explore" className="primary-button signal-success-action">
            Return to Signals
          </Link>
          <Link to={submitAnotherHref} className="ghost-button signal-success-action">
            Submit Another Signal
          </Link>
          <button type="button" className="ghost-button signal-success-action" onClick={openTechnicalDetails}>
            View Receipt
          </button>
        </div>

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
              <strong>{storedOnWalrus ? "Verifiable" : "Recovery ready"}</strong>
            </div>
            <div className="metadata-row">
              <span>Network</span>
              <strong>{networkLabel}</strong>
            </div>
            <div className="metadata-row">
              <span>Provider</span>
              <strong>{providerDetailLabel}</strong>
            </div>
            {submitted.receiptBlobId ? (
              <SignalMetaRow label="Recovery Path" type="blob" value={submitted.receiptBlobId} />
            ) : null}
            {submitted.onchainSignalId !== undefined ? (
              <div className="metadata-row">
                <span>Submission receipt</span>
                <strong>{submitted.onchainSignalId}</strong>
              </div>
            ) : null}
            <SignalMetaRow label="Blob ID" type="blob" value={submitted.blobId}>
              <StorageProof blobId={submitted.blobId} proof={submitted.walrusProof} compact />
            </SignalMetaRow>
            {hasDedicatedEncryptedPayloadBlob(submitted) ? (
              <SignalMetaRow label="Encrypted evidence blob" type="seal" value={submitted.encryptedBlobId}>
                <StorageProof
                  blobId={submitted.encryptedBlobId}
                  proof={submitted.encryptedWalrusProof ?? submitted.walrusProof}
                  compact
                />
              </SignalMetaRow>
            ) : null}
            {submitted.isEncrypted && !hasDedicatedEncryptedPayloadBlob(submitted) ? (
              <div className="metadata-row">
                <span>Encrypted payload</span>
                <strong>{getEncryptedPayloadAvailabilityLabel(submitted)}</strong>
              </div>
            ) : null}
            <SignalMetaRow label="Seal Identity" type="seal" value={submitted.sealIdentity} emptyLabel={notAvailableLabel} />
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
                          <SignalMetaChip type="blob" value={attachment.blobId} />
                          <div className="signal-meta-row-value">
                            <StorageProof
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
                  <StorageProof
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
