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
import { formatDate } from "../../../lib/utils";
import type { SignalRecord } from "../hooks/useSignalInboxData";
import type { ResponsesCsvExportScope, ResponsesCsvSortOrder } from "../../../lib/exportResponses";

type TranslationFn = ReturnType<typeof useI18n>["t"];

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
  canDecrypt,
  relatedSignals,
  selectedSignalId,
  onSelectRelatedRecord,
}: SecondaryInspectorProps) {
  const respondentMeta = getSubmissionRespondentMeta(selectedRecord.submission);
  const respondentIdentityLabel = getRespondentIdentityLabel(selectedRecord.submission);
  const respondentDisplayAddress = respondentMeta.verifiedAddress ?? respondentMeta.walletAddress;

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
                  <span>{t("storageStatusLabel")}</span>
                  <strong>{selectedRecordStoredOnWalrus ? t("storedOnWalrus") : t("localFallbackLabel")}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("providerLabel")}</span>
                  <strong>{t("poweredByTatum")}</strong>
                </div>
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
                to={`/dashboard/forms/${selectedRecord.form.id}/submissions/${selectedRecord.submission.id}`}
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

      <div className="inspector-utility-links">
        <Link className="ghost-button" to={`/dashboard/forms/${selectedRecord.form.id}`}>
          {t("reviewSubmissions")}
        </Link>
      </div>
    </section>
  );
}
