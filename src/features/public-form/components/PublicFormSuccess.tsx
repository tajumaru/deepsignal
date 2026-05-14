import { BlobLink } from "../../../components/BlobLink";
import { SignalMetaChip, SignalMetaRow } from "../../../components/SignalMetaChip";
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

  return (
    <section className="stack">
      <section className="panel glow-panel success-screen">
        <p className="eyebrow">{signalReceivedLabel}</p>
        <h1>{isEncryptedSubmission ? "Private signal sent" : "Signal sent"}</h1>
        <p className="lede">
          {isEncryptedSubmission
            ? "Only authorized reviewers can unlock this message inside the encrypted feedback inbox."
            : "Reviewers can open this submission directly from the inbox."}
        </p>
        <p>{isLocalFallbackBlob(submitted.encryptedBlobId ?? submitted.blobId) ? "Stored locally only" : "Trusted storage ready"}</p>
        <p>{thanksForFeedbackLabel}</p>
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
              <h3>Submission details</h3>
            </span>
          </summary>
          <div className="metadata-list">
            {submitted.onchainSignalId !== undefined ? (
              <div className="metadata-row">
                <span>Signal Receipt</span>
                <strong>{submitted.onchainSignalId}</strong>
              </div>
            ) : null}
            <SignalMetaRow label="Submission Blob ID" type="blob" value={submitted.blobId}>
              <BlobLink blobId={submitted.blobId} label="Verify on Walrus" />
            </SignalMetaRow>
            {hasDedicatedEncryptedPayloadBlob(submitted) ? (
              <SignalMetaRow label="Private Signal Blob" type="seal" value={submitted.encryptedBlobId}>
                <BlobLink blobId={submitted.encryptedBlobId} label="Verify on Walrus" />
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
              <span>Respondent</span>
              <strong>{submittedRespondentMeta.isAnonymous ? "Anonymous respondent" : "Wallet attached"}</strong>
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
                            <BlobLink blobId={attachment.blobId} label="Verify on Walrus" />
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
