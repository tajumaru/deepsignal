import { SignalMetaChip, SignalMetaRow } from "../../../components/SignalMetaChip";
import { StorageProof } from "../../../components/StorageProof";
import { TatumFrogIcon } from "../../../components/NetworkMenu";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../../../lib/encryptionDisplay";
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
  const storageLabels = getStorageDetailLabels(submitted.encryptedBlobId ?? submitted.blobId);
  const submittedRespondentMeta = getSubmissionRespondentMeta(submitted);
  const isEncryptedSubmission = Boolean(submitted.isEncrypted);
  const primaryBlobId = submitted.encryptedBlobId ?? submitted.blobId;
  const storedOnWalrus = Boolean(primaryBlobId && !isLocalFallbackBlob(primaryBlobId));
  const evidenceBlobId = submitted.encryptedBlobId ?? submitted.blobId;
  const networkLabel = storedOnWalrus ? getCurrentWalrusNetwork() : "local";

  return (
    <section className="stack">
      <section className="panel glow-panel success-screen">
        <p className="eyebrow">{signalReceivedLabel}</p>
        <h1>Your secure report is sealed and ready for review.</h1>
        <p className="lede">
          {isEncryptedSubmission
            ? "Only authorized reviewers can decrypt it when they open the Review Console."
            : "Selected reviewers can now review it in the Review Console."}
        </p>
        <div className="signal-success-receipt" role="list" aria-label="Signal delivery receipt">
          <div className="signal-success-receipt-item is-complete" role="listitem">
            <span aria-hidden="true" />
            <strong>Report encrypted</strong>
          </div>
          <div className={`signal-success-receipt-item ${storedOnWalrus ? "is-complete" : "is-local"}`} role="listitem">
            <span aria-hidden="true" />
            <strong>{storedOnWalrus ? "Stored on Walrus" : "Saved to local recovery"}</strong>
          </div>
          <div className={`signal-success-receipt-item ${storedOnWalrus ? "is-complete" : "is-local"}`} role="listitem">
            <span aria-hidden="true" />
            <strong>{storedOnWalrus ? "Verification path ready" : "Local recovery path ready"}</strong>
          </div>
        </div>
        <div className="success-stamp-row">
          <div className="certified-stamp">
            <TatumFrogIcon className="certified-stamp-icon" />
            <span>Certified</span>
          </div>
          <div className="signal-badge-row">
            <span className="signal-chip signal-chip-soft">Powered by Tatum</span>
            <span className="signal-chip signal-chip-soft">Walrus evidence layer</span>
          </div>
        </div>
        <p className="muted">{thanksForFeedbackLabel}</p>
        {submitNotice ? <p className="muted">{submitNotice}</p> : null}
        <div className="success-copy">
          {storageLabels.map((label) => (
            <p key={label}>{label}</p>
          ))}
        </div>
        <section className="evidence-layer-card" aria-label="Evidence trust receipt">
          <div>
            <p className="eyebrow">Evidence / Trust Layer</p>
            <h3>Verifiable submission receipt</h3>
            <p className="muted">This submission can be verified later.</p>
          </div>
          <div className="evidence-layer-grid">
            <div className="evidence-layer-item">
              <span>Storage status</span>
              <strong>{storedOnWalrus ? "Stored on Walrus" : "Local fallback preserved"}</strong>
            </div>
            <div className="evidence-layer-item">
              <span>Verification status</span>
              <strong>{storedOnWalrus ? "Verifiable" : "Recovery only"}</strong>
            </div>
            <div className="evidence-layer-item">
              <span>Network</span>
              <strong>{networkLabel}</strong>
            </div>
            <div className="evidence-layer-item">
              <span>Provider</span>
              <strong>Powered by Tatum</strong>
            </div>
            {evidenceBlobId ? (
              <div className="evidence-layer-item">
                <span>Blob ID</span>
                <SignalMetaChip type="blob" value={evidenceBlobId} />
              </div>
            ) : null}
          </div>
          <div className="evidence-layer-badges">
            <span className="evidence-layer-badge">{isEncryptedSubmission ? "Encrypted" : "Readable"}</span>
            <span className="evidence-layer-badge">
              {submittedRespondentMeta.isAnonymous ? "Anonymous" : "Verified sender"}
            </span>
            <span className="evidence-layer-badge">{storedOnWalrus ? "Immutable" : "Fallback-safe"}</span>
          </div>
          {storedOnWalrus && evidenceBlobId ? (
            <StorageProof
              blobId={evidenceBlobId}
              proof={submitted.encryptedWalrusProof ?? submitted.walrusProof}
              label="Evidence proof"
            />
          ) : null}
        </section>
        <details className="answer-card public-submit-details">
          <summary>
            <span>
              <p className="eyebrow">Evidence layer</p>
              <h3>Submission details</h3>
            </span>
          </summary>
          <div className="metadata-list">
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
          </div>
        </details>
      </section>
    </section>
  );
}
