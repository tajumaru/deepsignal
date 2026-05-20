import { SignalMetaChip, SignalMetaRow } from "../../../components/SignalMetaChip";
import { StorageProof } from "../../../components/StorageProof";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../../../lib/encryptionDisplay";
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

  return (
    <section className="stack">
      <section className="panel glow-panel success-screen">
        <p className="eyebrow">{signalReceivedLabel}</p>
        <h1>Your encrypted signal was securely delivered.</h1>
        <p className="lede">
          {isEncryptedSubmission
            ? "Only authorized reviewers can decrypt it when they open the Signal Inbox."
            : "Selected reviewers can now review it in the Signal Inbox."}
        </p>
        <div className="signal-success-receipt" role="list" aria-label="Signal delivery receipt">
          <div className="signal-success-receipt-item is-complete" role="listitem">
            <span aria-hidden="true" />
            <strong>Signal secured</strong>
          </div>
          <div className={`signal-success-receipt-item ${storedOnWalrus ? "is-complete" : "is-local"}`} role="listitem">
            <span aria-hidden="true" />
            <strong>{storedOnWalrus ? "Permanent encrypted storage" : "Saved to local recovery"}</strong>
          </div>
          <div className={`signal-success-receipt-item ${storedOnWalrus ? "is-complete" : "is-local"}`} role="listitem">
            <span aria-hidden="true" />
            <strong>{storedOnWalrus ? "Recovery path ready" : "Local recovery path ready"}</strong>
          </div>
        </div>
        <p className="muted">{thanksForFeedbackLabel}</p>
        {submitNotice ? <p className="muted">{submitNotice}</p> : null}
        <div className="success-copy">
          {storageLabels.map((label) => (
            <p key={label}>{label}</p>
          ))}
        </div>
        <details className="answer-card public-submit-details">
          <summary>
            <span>
              <p className="eyebrow">Trusted storage</p>
              <h3>Signal details</h3>
            </span>
          </summary>
          <div className="metadata-list">
            {submitted.onchainSignalId !== undefined ? (
              <div className="metadata-row">
                <span>Signal Receipt</span>
                <strong>{submitted.onchainSignalId}</strong>
              </div>
            ) : null}
            <SignalMetaRow label="Signal Storage ID" type="blob" value={submitted.blobId}>
              <StorageProof blobId={submitted.blobId} proof={submitted.walrusProof} compact />
            </SignalMetaRow>
            {hasDedicatedEncryptedPayloadBlob(submitted) ? (
              <SignalMetaRow label="Private Signal Blob" type="seal" value={submitted.encryptedBlobId}>
                <StorageProof
                  blobId={submitted.encryptedBlobId}
                  proof={submitted.encryptedWalrusProof ?? submitted.walrusProof}
                  compact
                />
              </SignalMetaRow>
            ) : null}
            {submitted.isEncrypted && !hasDedicatedEncryptedPayloadBlob(submitted) ? (
              <div className="metadata-row">
                <span>Private Signal</span>
                <strong>{getEncryptedPayloadAvailabilityLabel(submitted)}</strong>
              </div>
            ) : null}
            <SignalMetaRow label="Seal Identity" type="seal" value={submitted.sealIdentity} emptyLabel={notAvailableLabel} />
            <div className="metadata-row">
              <span>Sender identity</span>
              <strong>{submittedRespondentMeta.isAnonymous ? "Anonymous" : "Wallet verified"}</strong>
            </div>
            {submitted.pendingOnchainRegistration ? (
              <div className="metadata-row">
                <span>Sui registration</span>
                <strong>{pendingSuiRegistrationLabel}</strong>
              </div>
            ) : null}
            <div className="metadata-row signal-meta-row">
              <span>Attachment Blob IDs</span>
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
