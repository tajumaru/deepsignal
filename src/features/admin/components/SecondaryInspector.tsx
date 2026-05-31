import { Link } from "react-router-dom";
import { BlobLink } from "../../../components/BlobLink";
import { RelatedSignalsPanel } from "../../../components/RelatedSignalsPanel";
import { SealStatusCard } from "../../../components/SealStatusCard";
import { SignalMetaChip, SignalMetaRow } from "../../../components/SignalMetaChip";
import { StorageProof } from "../../../components/StorageProof";
import { useI18n } from "../../../i18n";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../../../lib/encryptionDisplay";
import type { RelatedSignalResult } from "../../../lib/relatedSignals";
import { getRespondentIdentityLabel, getSubmissionRespondentMeta } from "../../../lib/respondentMeta";
import { getSignalSyncSummary, isLocalFallbackBlob } from "../../../lib/signalInbox";
import { getSubmissionVersion } from "../../../lib/submissionVersioning";
import { formatDate } from "../../../lib/utils";
import type { SignalRecord } from "../hooks/useSignalInboxData";
import type { ResponsesCsvExportScope, ResponsesCsvSortOrder } from "../../../lib/exportResponses";
import type { SignalInsightEligibility, SignalProcessingMode, SignalReviewState, SignalVisibilityState } from "../../../types";

type TranslationFn = ReturnType<typeof useI18n>["t"];

function getProcessingModeLabel(mode: SignalProcessingMode, t: TranslationFn) {
  if (mode === "auto_process") {
    return t("processingModeAutoProcess");
  }
  if (mode === "hybrid") {
    return t("processingModeHybrid");
  }
  return t("processingModeReviewRequired");
}

function getReviewStatePipelineLabel(state: SignalReviewState | undefined, t: TranslationFn) {
  switch (state) {
    case "not_required":
      return t("reviewStateNotRequired");
    case "in_review":
      return t("reviewStateInReview");
    case "reviewed":
      return t("reviewStateReviewed");
    case "suppressed":
      return t("reviewStateSuppressed");
    case "queued":
    default:
      return t("reviewStateQueued");
  }
}

function getVisibilityStatePipelineLabel(state: SignalVisibilityState | undefined, t: TranslationFn) {
  switch (state) {
    case "aggregate_only":
      return t("visibilityStateAggregateOnly");
    case "reviewed_public":
      return t("visibilityStateReviewedPublic");
    case "public":
      return t("visibilityStatePublic");
    case "private":
    default:
      return t("visibilityStatePrivate");
  }
}

function getInsightEligibilityPipelineLabel(state: SignalInsightEligibility | undefined, t: TranslationFn) {
  switch (state) {
    case "eligible":
      return t("insightEligibilityEligible");
    case "metadata_only":
      return t("insightEligibilityMetadataOnly");
    case "excluded":
      return t("insightEligibilityExcluded");
    case "requires_review":
    default:
      return t("insightEligibilityRequiresReview");
  }
}

interface SecondaryInspectorProps {
  t: TranslationFn;
  selectedRecord: SignalRecord;
  csvExportScopeLabel: string;
  csvExportShortScopeLabel: string;
  csvExportCount: number;
  csvExportIncludesDecryptedData: boolean;
  csvExportScope: ResponsesCsvExportScope;
  csvSortOrder: ResponsesCsvSortOrder;
  onCsvExportScopeChange: (value: ResponsesCsvExportScope) => void;
  onCsvSortOrderChange: (value: ResponsesCsvSortOrder) => void;
  onExportJson: () => void;
  onOpenCsvExportReview: () => void;
  storageProofOpen: boolean;
  onStorageProofOpenChange: (open: boolean) => void;
  advancedMetadataOpen: boolean;
  onAdvancedMetadataOpenChange: (open: boolean) => void;
  relatedSignalsOpen: boolean;
  onRelatedSignalsOpenChange: (open: boolean) => void;
  storageMode: "walrus" | "local-fallback";
  isRegisteringSelectedSignal: boolean;
  onRegisterSelectedSignal: () => void;
  detailLegacyUnencrypted: boolean;
  detailAnswersPresent: boolean;
  hasAdminAccess: boolean;
  selectedRecordStoredOnWalrus: boolean;
  privateReviewLabel: string;
  responseDeadlineValue: string;
  walletAccessValue: string;
  pendingSuiRegistrationValue: string;
  rpcProviderLabel: string;
  rpcNetworkLabel: string;
  verificationRouteLabel: string;
  txDigest?: string;
  canDecrypt: boolean;
  relatedSignals: RelatedSignalResult[];
  selectedSignalId?: string;
  onSelectRelatedRecord: (record: SignalRecord) => void;
}

export function SecondaryInspector({
  t,
  selectedRecord,
  csvExportScopeLabel,
  csvExportShortScopeLabel,
  csvExportCount,
  csvExportIncludesDecryptedData,
  csvExportScope,
  csvSortOrder,
  onCsvExportScopeChange,
  onCsvSortOrderChange,
  onExportJson,
  onOpenCsvExportReview,
  storageProofOpen,
  onStorageProofOpenChange,
  advancedMetadataOpen,
  onAdvancedMetadataOpenChange,
  relatedSignalsOpen,
  onRelatedSignalsOpenChange,
  storageMode,
  isRegisteringSelectedSignal,
  onRegisterSelectedSignal,
  detailLegacyUnencrypted,
  detailAnswersPresent,
  hasAdminAccess,
  selectedRecordStoredOnWalrus,
  privateReviewLabel,
  responseDeadlineValue,
  walletAccessValue,
  pendingSuiRegistrationValue,
  rpcProviderLabel,
  rpcNetworkLabel,
  verificationRouteLabel,
  txDigest,
  canDecrypt,
  relatedSignals,
  selectedSignalId,
  onSelectRelatedRecord,
}: SecondaryInspectorProps) {
  const respondentMeta = getSubmissionRespondentMeta(selectedRecord.submission);
  const respondentIdentityLabel = getRespondentIdentityLabel(selectedRecord.submission);
  const respondentDisplayAddress = respondentMeta.verifiedAddress ?? respondentMeta.walletAddress;
  const submissionObjectId =
    selectedRecord.submission.walrusProof?.objectId ??
    selectedRecord.submission.encryptedWalrusProof?.objectId;
  const encryptedObjectId = selectedRecord.submission.encryptedWalrusProof?.objectId;
  const processingMode = selectedRecord.submission.processingMode ?? selectedRecord.form.processingMode ?? "review_required";
  const insightPayload = selectedRecord.submission.insightPayload;
  const insightPayloadSummary = insightPayload
    ? t("insightPayloadSummary", {
        aggregate: insightPayload.fieldIds?.length ?? 0,
        review: insightPayload.redactedFieldIds?.length ?? 0,
      })
    : t("notAvailable");

  return (
    <section className="secondary-inspector">
      <div className="secondary-inspector-header">
        <div>
          <p className="eyebrow">{t("secondaryToolsEyebrow")}</p>
          <h3>{t("secondaryInspectorTitle")}</h3>
        </div>
        <p className="muted">{t("metadataExportBody")}</p>
      </div>

      <div className="secondary-inspector-grid">
        <details className="inspector-panel inspector-export-panel">
          <summary>
            <span>
              <p className="eyebrow">{t("exportInspectorEyebrow")}</p>
              <strong>{t("jsonCsvTitle")}</strong>
            </span>
            <span className="inspector-summary">{csvExportScopeLabel}</span>
          </summary>
          <div className="inspector-panel-body">
            <div className="export-quick-summary" aria-label={t("currentExportSummaryAriaLabel")}>
              <span>{csvExportShortScopeLabel}</span>
              <span>{t("responsesCount", { count: csvExportCount })}</span>
              <span>
                {csvExportIncludesDecryptedData
                  ? t("decryptedDataIncluded")
                  : t("decryptedDataNotIncluded")}
              </span>
            </div>
            <div className="inspector-export-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={onExportJson}
              >
                {t("exportJson")}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={onOpenCsvExportReview}
                disabled={csvExportCount === 0}
              >
                {t("exportCsv")}
              </button>
            </div>
            <div className="inspector-export-options">
              <label className="review-select export-select">
                <span>{t("exportScope")}</span>
                <select
                  value={csvExportScope}
                  onChange={(event) => onCsvExportScopeChange(event.target.value as ResponsesCsvExportScope)}
                >
                  <option value="filtered">{t("exportVisibleFilteredResponses")}</option>
                  <option value="all">{t("exportAllResponses")}</option>
                  <option value="selected">{t("exportSelectedResponses")}</option>
                </select>
              </label>
              <label className="review-select export-select">
                <span>{t("csvSortOrder")}</span>
                <select
                  value={csvSortOrder}
                  onChange={(event) => onCsvSortOrderChange(event.target.value as ResponsesCsvSortOrder)}
                >
                  <option value="createdAtDesc">{t("createdAtDesc")}</option>
                  <option value="createdAtAsc">{t("createdAtAsc")}</option>
                </select>
              </label>
            </div>
            {csvExportCount === 0 ? (
              <p className="export-zero-note">{t("noResponsesMatchCurrentFilters")}</p>
            ) : null}
            <p className="export-privacy-note">
              {t("exportCsvPrivacyNote")}
            </p>
          </div>
        </details>

        <details
          className="inspector-panel signal-proof-panel"
          open={storageProofOpen}
          onToggle={(event) => {
            onStorageProofOpenChange((event.currentTarget as HTMLDetailsElement).open);
          }}
        >
          <summary>
            <span>
              <p className="eyebrow">{t("evidenceVerificationEyebrow")}</p>
              <strong>{t("trustLayerReceiptTitle")}</strong>
            </span>
            <span className="inspector-summary">{storageMode === "walrus" ? t("storageWalrus") : t("localFallbackLabel")}</span>
          </summary>
          <div className="inspector-panel-body">
            <div className="inspector-subsection">
              <div className="section-row">
                <div>
                  <p className="eyebrow">{t("evidenceLayerEyebrow")}</p>
                  <h3>{t("signalMetadataAndProofTitle")}</h3>
                </div>
                {selectedRecord.submission.pendingOnchainRegistration ? (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={isRegisteringSelectedSignal}
                    onClick={onRegisterSelectedSignal}
                  >
                    {isRegisteringSelectedSignal ? t("registeringStatus") : t("registerProofOnSui")}
                  </button>
                ) : null}
              </div>
              <div className="metadata-list signal-proof-metadata-list">
                <div className="metadata-row">
                  <span>{t("verificationStatusLabel")}</span>
                  <strong>
                    {detailLegacyUnencrypted
                      ? t("legacyUnencryptedResponse")
                      : detailAnswersPresent
                        ? t("privateSignalUnlockedStatus")
                        : t("encryptedPrivateSignalStatus")}
                  </strong>
                </div>
                <div className="metadata-row">
                  <span>{t("reviewAccessLabel")}</span>
                  <strong>{hasAdminAccess ? t("projectReviewerAccess") : t("walletLabel")}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("processingModeLabel")}</span>
                  <strong>{getProcessingModeLabel(processingMode, t)}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("reviewStateLabel")}</span>
                  <strong>{getReviewStatePipelineLabel(selectedRecord.submission.reviewState, t)}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("visibilityStateLabel")}</span>
                  <strong>{getVisibilityStatePipelineLabel(selectedRecord.submission.visibilityState, t)}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("insightEligibilityLabel")}</span>
                  <strong>{getInsightEligibilityPipelineLabel(selectedRecord.submission.insightEligibility, t)}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("insightPayloadLabel")}</span>
                  <strong>{insightPayloadSummary}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("storageStatusLabel")}</span>
                  <strong>{selectedRecordStoredOnWalrus ? t("storedOnWalrus") : t("localFallbackLabel")}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("providerLabel")}</span>
                  <strong>{rpcProviderLabel}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("networkLabel")}</span>
                  <strong>{rpcNetworkLabel}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("verificationRouteLabel")}</span>
                  <strong>{verificationRouteLabel}</strong>
                </div>
                <div className="metadata-row">
                  <span>Form version</span>
                  <strong>v{getSubmissionVersion(selectedRecord.submission)}</strong>
                </div>
                {selectedRecord.submission.schemaHash ? (
                  <div className="metadata-row">
                    <span>Schema hash</span>
                    <strong>{selectedRecord.submission.schemaHash}</strong>
                  </div>
                ) : null}
                <SignalMetaRow label={t("formBlobId")} type="blob" value={selectedRecord.form.blobId} emptyLabel={t("notAvailable")}>
                  {!isLocalFallbackBlob(selectedRecord.form.blobId) ? (
                    <BlobLink
                      blobId={selectedRecord.form.blobId}
                      label={t("verifyOnWalrus")}
                    />
                  ) : null}
                </SignalMetaRow>
                <SignalMetaRow label={t("submissionBlobIdLabel")} type="blob" value={selectedRecord.submission.blobId} emptyLabel={t("notAvailable")}>
                  {!isLocalFallbackBlob(selectedRecord.submission.blobId) ? (
                    <StorageProof
                      blobId={selectedRecord.submission.blobId}
                      proof={selectedRecord.submission.walrusProof}
                      compact
                    />
                  ) : null}
                </SignalMetaRow>
                {hasDedicatedEncryptedPayloadBlob(selectedRecord.submission) ? (
                  <SignalMetaRow
                    label={t("encryptedPayloadBlobId")}
                    type="seal"
                    value={selectedRecord.submission.encryptedBlobId}
                  >
                    {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                      <StorageProof
                        blobId={selectedRecord.submission.encryptedBlobId}
                        proof={selectedRecord.submission.encryptedWalrusProof ?? selectedRecord.submission.walrusProof}
                        compact
                      />
                    ) : null}
                  </SignalMetaRow>
                ) : selectedRecord.submission.isEncrypted ? (
                  <div className="metadata-row">
                    <span>{t("encryptedPayloadLabel")}</span>
                    <strong>{getEncryptedPayloadAvailabilityLabel(selectedRecord.submission)}</strong>
                  </div>
                ) : null}
                <div className="metadata-row">
                  <span>{t("auditTrailLabel")}</span>
                  <strong>{privateReviewLabel}</strong>
                </div>
                {txDigest ? (
                  <div className="metadata-row">
                    <span>{t("txDigestLabel")}</span>
                    <strong>{txDigest}</strong>
                  </div>
                ) : null}
              </div>
              <details
                className="inspector-nested-detail"
                open={advancedMetadataOpen}
                onToggle={(event) => {
                  onAdvancedMetadataOpenChange((event.currentTarget as HTMLDetailsElement).open);
                }}
              >
                <summary>{t("advancedMetadataTitle")}</summary>
                <div className="metadata-list signal-proof-metadata-list">
                  {hasAdminAccess ? (
                    <SignalMetaRow label={t("projectLabel")} type="registry" value={selectedRecord.form.projectId} emptyLabel={t("notAvailable")} />
                  ) : null}
                  {typeof selectedRecord.form.onchainFormId === "number" ? (
                    <div className="metadata-row">
                      <span>{t("registryFormIdLabel")}</span>
                      <strong>{selectedRecord.form.onchainFormId}</strong>
                    </div>
                  ) : null}
                  {typeof selectedRecord.submission.onchainSignalId === "number" ? (
                    <div className="metadata-row">
                      <span>{t("signalReceiptLabel")}</span>
                      <strong>{selectedRecord.submission.onchainSignalId}</strong>
                    </div>
                  ) : null}
                  {submissionObjectId ? (
                    <SignalMetaRow
                      label={t("submissionObjectIdLabel")}
                      type="registry"
                      value={submissionObjectId}
                      emptyLabel={t("notAvailable")}
                    />
                  ) : null}
                  {encryptedObjectId ? (
                    <SignalMetaRow
                      label={t("encryptedObjectIdLabel")}
                      type="registry"
                      value={encryptedObjectId}
                      emptyLabel={t("notAvailable")}
                    />
                  ) : null}
                  <SignalMetaRow label={t("sealIdentityLabel")} type="seal" value={selectedRecord.submission.sealIdentity} emptyLabel={t("notAvailable")} />
                  {selectedRecord.submission.signalReceiptMetadataDigest ? (
                    <SignalMetaRow
                      label={t("receiptMetadataDigestLabel")}
                      type="registry"
                      value={selectedRecord.submission.signalReceiptMetadataDigest}
                      emptyLabel={t("notAvailable")}
                    />
                  ) : null}
                  <div className="metadata-row signal-meta-row">
                    <span>{t("attachmentBlobIds")}</span>
                    <div className="stack signal-meta-row-value">
                      {selectedRecord.submission.attachments.length === 0 ? (
                        <strong>{t("notAvailable")}</strong>
                      ) : (
                        selectedRecord.submission.attachments.map((attachment) => (
                          <div key={attachment.blobId} className="signal-meta-row-value">
                            {attachment.storage === "inline" ? (
                              <strong>{t("embeddedInPrivateSignal")}</strong>
                            ) : (
                              <SignalMetaChip type="blob" value={attachment.blobId} />
                            )}
                            {attachment.storage !== "inline" && !isLocalFallbackBlob(attachment.blobId) ? (
                              <StorageProof
                                blobId={attachment.blobId}
                                proof={attachment.walrusProof}
                                fallbackSize={attachment.size}
                                compact
                              />
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="metadata-row">
                    <span>Respondent identity</span>
                    {respondentMeta.isAnonymous ? (
                      <strong>{t("anonymousRespondent")}</strong>
                    ) : respondentDisplayAddress ? (
                      <SignalMetaChip
                        type="contributor"
                        value={respondentDisplayAddress}
                      />
                    ) : (
                      <strong>{t("notAvailable")}</strong>
                    )}
                  </div>
                  <div className="metadata-row">
                    <span>Identity type</span>
                    <strong>{respondentIdentityLabel}</strong>
                  </div>
                  <div className="metadata-row">
                    <span>{t("anonymousLabel")}</span>
                    <strong>{respondentMeta.isAnonymous ? t("yesLabel") : t("noLabel")}</strong>
                  </div>
                  <div className="metadata-row">
                    <span>{t("submittedLabel")}</span>
                    <strong>{formatDate(respondentMeta.submittedAt)}</strong>
                  </div>
                  <div className="metadata-row">
                    <span>{t("chainLabel")}</span>
                    <strong>{respondentMeta.chain}</strong>
                  </div>
                  <div className="metadata-row">
                    <span>{t("storageMode")}</span>
                    <strong>
                      {storageMode === "walrus"
                        ? t("storageWalrus")
                        : t("localFallbackLabel")}
                    </strong>
                  </div>
                  <div className="metadata-row">
                    <span>{t("responseDeadlineLabel")}</span>
                    <strong>{responseDeadlineValue}</strong>
                  </div>
                  <div className="metadata-row">
                    <span>{t("walletAccessStatus")}</span>
                    <strong>{walletAccessValue}</strong>
                  </div>
                  <div className="metadata-row">
                    <span>{t("signalSyncLabel")}</span>
                    <strong>{getSignalSyncSummary(selectedRecord.submission)}</strong>
                  </div>
                  <div className="metadata-row">
                    <span>{t("pendingSuiRegistrationLabel")}</span>
                    <strong>{pendingSuiRegistrationValue}</strong>
                  </div>
                </div>
              </details>
            </div>
            <div className="inspector-subsection inspector-seal-subsection">
              <div>
                <p className="eyebrow">{t("sealDetailsEyebrow")}</p>
                <h3>{t("encryptedPayloadDetailsTitle")}</h3>
              </div>
              <SealStatusCard
                encryptSubmissions={selectedRecord.form.encryptSubmissions}
                canDecrypt={canDecrypt}
              />
            </div>
            <div className="review-secondary-links inspector-related-links">
              <Link
                className="review-inline-link"
                to={`/dashboard?tab=review&form=${encodeURIComponent(selectedRecord.form.id)}&signal=${encodeURIComponent(selectedRecord.submission.id)}`}
              >
                {t("reviewThreadLabel")}
              </Link>
              {selectedRecord.submission.pendingOnchainRegistration ? (
                <span className="muted">{t("suiRegistrationOptionalProof")}</span>
              ) : null}
            </div>
          </div>
        </details>

        <details
          className="inspector-panel"
          open={relatedSignalsOpen}
          onToggle={(event) => {
            onRelatedSignalsOpenChange((event.currentTarget as HTMLDetailsElement).open);
          }}
        >
          <summary>
            <span>
              <p className="eyebrow">{t("reviewSupportEyebrow")}</p>
              <strong>{t("relatedSignalsTitle")}</strong>
            </span>
            <span className="inspector-summary">{t("reviewSupportSummary")}</span>
          </summary>
          <div className="inspector-panel-body">
            <RelatedSignalsPanel
              relatedSignals={relatedSignals}
              selectedSignalId={selectedSignalId}
              onSelectRecord={onSelectRelatedRecord}
            />
          </div>
        </details>
      </div>
    </section>
  );
}
