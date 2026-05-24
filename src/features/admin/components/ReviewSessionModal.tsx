import type { ComponentProps, ReactNode, Ref } from "react";
import { PrivateSignalUnlockCard } from "../../../components/PrivateSignalUnlockCard";
import { StorageProof } from "../../../components/StorageProof";
import { useI18n } from "../../../i18n";
import { isAttachmentFieldType } from "../../../lib/fieldTypes";
import { formatDate } from "../../../lib/utils";
import { isLocalFallbackBlob } from "../../../lib/signalInbox";
import type { AttachmentPreviewState } from "../../../hooks/useAttachmentPreviews";
import type { SignalRecord } from "../hooks/useSignalInboxData";
import { SignalAttachmentList } from "./SignalAttachmentList";
import type { Submission } from "../../../types";

type ReviewSessionStep = 1 | 2 | 3 | 4;
type ReviewSessionMobileTab = "answers" | "review";

type ReviewDraftLike = Pick<Submission, "status" | "triageStatus" | "priority" | "signalValue"> & {
  notes: string;
  reviewer: string;
};

interface ReviewSessionModalProps {
  open: boolean;
  selectedRecord: SignalRecord | null;
  dialogRef: Ref<HTMLElement>;
  primaryActionRef: Ref<HTMLButtonElement>;
  onBackdropMouseDown: () => void;
  onRequestClose: () => void;
  onCompleteClose: () => void;
  reviewSessionCurrentStep: { id: ReviewSessionStep; title: string; detail: string };
  reviewSessionStepItems: ReadonlyArray<{ id: ReviewSessionStep; title: string; detail: string }>;
  reviewSessionStep: ReviewSessionStep;
  setReviewSessionStep: (step: ReviewSessionStep | ((current: ReviewSessionStep) => ReviewSessionStep)) => void;
  reviewSessionMobileTab: ReviewSessionMobileTab;
  setReviewSessionMobileTab: (tab: ReviewSessionMobileTab) => void;
  reviewStatusPillState: string;
  reviewStatusPillLabel: string | null;
  selectedRecordNeedsDecrypt: boolean;
  detailAnswers: Record<string, unknown> | null;
  decrypting: boolean;
  decryptState: ComponentProps<typeof PrivateSignalUnlockCard>["unlockState"];
  decryptStatusMessage: string;
  decryptError: string | null;
  decryptDiagnostics: ComponentProps<typeof PrivateSignalUnlockCard>["diagnostics"];
  selectedRecordUnlockDisabledReason: string | null | undefined;
  realSealSessionTtlMinutes: number;
  decryptInFlight: boolean;
  onDecrypt: () => void;
  onClearDebugCache: () => void;
  activeReviewDraft: ReviewDraftLike | null;
  patchReviewDraft: (patch: Partial<ReviewDraftLike>) => void;
  triageOptions: ReadonlyArray<{ value: Submission["triageStatus"] }>;
  getLocalizedTriageStatusLabel: (value: Submission["triageStatus"]) => string;
  renderAnswerValue: (field: SignalRecord["form"]["fields"][number], value: unknown) => ReactNode;
  detailAttachments: Submission["attachments"];
  attachmentPreviews: Record<string, AttachmentPreviewState>;
  selectedReviewerDisplayLabel: string | undefined;
  walletAccountAddress: string | null | undefined;
  selectedNeedsFollowUp: boolean;
  saving: boolean;
  onToggleNeedsFollowUp: () => void;
  draftTriageStatus: Submission["triageStatus"];
  draftReviewStatus: Submission["status"];
  isDraftOnRoadmap: boolean;
  publicResultValue: string;
  canAdvanceReviewSession: boolean;
  hasReviewDraftChanges: boolean;
  hasSavedReviewResult: boolean;
  onSaveReview: () => Promise<boolean>;
}

export function ReviewSessionModal({
  open,
  selectedRecord,
  dialogRef,
  primaryActionRef,
  onBackdropMouseDown,
  onRequestClose,
  onCompleteClose,
  reviewSessionCurrentStep,
  reviewSessionStepItems,
  reviewSessionStep,
  setReviewSessionStep,
  reviewSessionMobileTab,
  setReviewSessionMobileTab,
  reviewStatusPillState,
  reviewStatusPillLabel,
  selectedRecordNeedsDecrypt,
  detailAnswers,
  decrypting,
  decryptState,
  decryptStatusMessage,
  decryptError,
  decryptDiagnostics,
  selectedRecordUnlockDisabledReason,
  realSealSessionTtlMinutes,
  decryptInFlight,
  onDecrypt,
  onClearDebugCache,
  activeReviewDraft,
  patchReviewDraft,
  triageOptions,
  getLocalizedTriageStatusLabel,
  renderAnswerValue,
  detailAttachments,
  attachmentPreviews,
  selectedReviewerDisplayLabel,
  walletAccountAddress,
  selectedNeedsFollowUp,
  saving,
  onToggleNeedsFollowUp,
  draftTriageStatus,
  draftReviewStatus,
  isDraftOnRoadmap,
  publicResultValue,
  canAdvanceReviewSession,
  hasReviewDraftChanges,
  hasSavedReviewResult,
  onSaveReview,
}: ReviewSessionModalProps) {
  const { t } = useI18n();

  if (!open || !selectedRecord) {
    return null;
  }

  return (
    <div className="modal-backdrop review-session-backdrop" role="presentation" onMouseDown={onBackdropMouseDown}>
      <section
        ref={dialogRef}
        className={`answer-card review-session-modal ${reviewSessionStep === 1 && (decrypting || decryptInFlight) ? "is-decrypting" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-session-title"
        aria-describedby="review-session-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="review-session-shell">
          <div className="review-session-header">
            <div>
              <p className="eyebrow">{t("reviewSessionEyebrow")}</p>
              <h3 id="review-session-title">{reviewSessionCurrentStep.title}</h3>
              <p id="review-session-description" className="muted">{reviewSessionCurrentStep.detail}</p>
            </div>
            <div className="review-session-header-actions">
              <span className={`save-state-pill is-${reviewStatusPillState}`}>{reviewStatusPillLabel}</span>
              <button
                type="button"
                className="review-session-close-button"
                aria-label={t("closeLabel")}
                title={t("closeLabel")}
                onClick={onRequestClose}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7 17 17" />
                  <path d="M17 7 7 17" />
                </svg>
              </button>
            </div>
          </div>

          <div className="review-progress-rail review-session-progress" aria-label={t("reviewProgressAriaLabel")}>
            {reviewSessionStepItems.map((step) => {
              const isCompletedStep = reviewSessionStep > step.id;
              const isStepLocked = step.id > 1 && selectedRecordNeedsDecrypt && !detailAnswers;
              return (
                <button
                  key={step.id}
                  type="button"
                  className={`review-progress-step ${reviewSessionStep === step.id ? "is-current" : isCompletedStep ? "is-complete" : ""}`}
                  onClick={() => {
                    if (step.id === 1 || !selectedRecordNeedsDecrypt || Boolean(detailAnswers)) {
                      setReviewSessionStep(step.id);
                    }
                  }}
                  disabled={isStepLocked}
                >
                  <span className="review-progress-marker" aria-hidden="true">
                    {isCompletedStep ? "\u2713" : step.id}
                  </span>
                  <span className="review-progress-copy">
                    <span className="review-progress-step-label">
                      {reviewSessionStep > step.id ? t("doneLabel") : t("stepLabel", { count: step.id })}
                    </span>
                    <span className="review-progress-title">{step.title}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {reviewSessionStep === 1 ? (
            <div className={`review-session-stage review-session-stage-unlock ${decrypting || decryptInFlight ? "is-decrypting" : ""}`}>
              <div className="review-session-stage-copy">
                <strong>{t("privateSignalLockedTitle")}</strong>
                <p className="muted">{t("privateSignalLockedBody")}</p>
              </div>
              <div className={`review-session-decrypt-shell ${decrypting || decryptState === "decrypting" ? "is-active" : ""} ${detailAnswers ? "is-unlocked" : ""}`}>
                <PrivateSignalUnlockCard
                  onUnlock={onDecrypt}
                  onClearDebugCache={onClearDebugCache}
                  isDecrypting={decrypting || decryptInFlight}
                  isUnlocked={Boolean(detailAnswers)}
                  actionLabel={t("decryptSignalAction")}
                  unlockState={decryptState}
                  statusMessage={decryptStatusMessage}
                  errorMessage={decryptError ?? undefined}
                  diagnostics={decryptDiagnostics}
                  disabledReason={selectedRecordUnlockDisabledReason ?? undefined}
                  actionDisabled={Boolean(selectedRecordUnlockDisabledReason)}
                  supportContent={(
                    <>
                      <strong>{t("sealReviewSessionTitle")}</strong>
                      <p className="muted">
                        {t("walletApprovalReuseNotice", { minutes: realSealSessionTtlMinutes })}
                      </p>
                    </>
                  )}
                >
                  {selectedRecord.submission.encryptedBlobId && !isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                    <StorageProof
                      blobId={selectedRecord.submission.encryptedBlobId}
                      proof={selectedRecord.submission.encryptedWalrusProof ?? selectedRecord.submission.walrusProof}
                      compact
                    />
                  ) : null}
                </PrivateSignalUnlockCard>
              </div>
            </div>
          ) : null}

          {reviewSessionStep === 2 ? (
            <div className="review-session-stage review-session-stage-split">
              <div className="review-session-mobile-tabs" role="tablist" aria-label={t("reviewSessionSectionsAriaLabel")}>
                <button
                  type="button"
                  role="tab"
                  id="review-session-mobile-tab-answers"
                  aria-selected={reviewSessionMobileTab === "answers"}
                  aria-controls="review-session-mobile-panel-answers"
                  tabIndex={reviewSessionMobileTab === "answers" ? 0 : -1}
                  className={`review-session-mobile-tab ${reviewSessionMobileTab === "answers" ? "is-active" : ""}`}
                  onClick={() => setReviewSessionMobileTab("answers")}
                >
                  {t("originalSignalTitle")}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="review-session-mobile-tab-review"
                  aria-selected={reviewSessionMobileTab === "review"}
                  aria-controls="review-session-mobile-panel-review"
                  tabIndex={reviewSessionMobileTab === "review" ? 0 : -1}
                  className={`review-session-mobile-tab ${reviewSessionMobileTab === "review" ? "is-active" : ""}`}
                  onClick={() => setReviewSessionMobileTab("review")}
                >
                  {t("reviewClassifyTitle")}
                </button>
              </div>

              <div
                id="review-session-mobile-panel-answers"
                role="tabpanel"
                aria-labelledby="review-session-mobile-tab-answers"
                className={`review-session-read-panel ${reviewSessionMobileTab === "review" ? "is-mobile-hidden" : ""}`}
              >
                <div className="review-session-stage-copy">
                  <strong>{t("originalSignalTitle")}</strong>
                  <p className="muted">{t("originalSignalBody")}</p>
                </div>
                <div className="review-session-answer-list">
                  {selectedRecord.form.fields
                    .filter((field) => !isAttachmentFieldType(field.type))
                    .map((field, index) => (
                      <article key={field.id} className="review-session-answer-card">
                        <div className="review-session-question-head">
                          <span className="review-session-question-index">Q{index + 1}</span>
                          <strong>{field.label}</strong>
                        </div>
                        <div>{renderAnswerValue(field, detailAnswers?.[field.id])}</div>
                      </article>
                    ))}
                  {detailAttachments.length > 0 ? (
                    <article className="review-session-answer-card">
                      <span>{t("attachmentsTitle")}</span>
                      <SignalAttachmentList attachments={detailAttachments} attachmentPreviews={attachmentPreviews} />
                    </article>
                  ) : null}
                </div>
              </div>

              <div
                id="review-session-mobile-panel-review"
                role="tabpanel"
                aria-labelledby="review-session-mobile-tab-review"
                className={`review-stage-card ${reviewSessionMobileTab === "answers" ? "is-mobile-hidden" : ""}`}
              >
                <div className="review-stage-header">
                  <p className="eyebrow">{t("stepLabel", { count: 2 })}</p>
                  <strong>{t("reviewClassifyTitle")}</strong>
                </div>
                <div className="review-field-grid">
                  <div className="review-badge-field">
                    <span>{t("reviewStateLabel")}</span>
                    <div className="review-badge-options" role="group" aria-label={t("reviewStateLabel")}>
                      {[
                        { value: "unread", label: t("statusUnread") },
                        { value: "read", label: t("statusRead") },
                        { value: "archived", label: t("statusArchived") },
                      ].map((option) => {
                        const isSelected = activeReviewDraft?.status === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`review-state-badge is-status-${option.value} ${isSelected ? "is-active" : ""}`}
                            aria-pressed={isSelected}
                            disabled={isSelected}
                            onClick={() => patchReviewDraft({ status: option.value as Submission["status"] })}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="review-select review-badge-field">
                    <span>{t("triageStatusLabel")}</span>
                    <select
                      value={activeReviewDraft?.triageStatus ?? "new"}
                      onChange={(event) =>
                        patchReviewDraft({
                          triageStatus: event.target.value as Submission["triageStatus"],
                        })}
                    >
                      {triageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {getLocalizedTriageStatusLabel(option.value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="review-badge-field">
                    <span>{t("priority")}</span>
                    <div className="review-badge-options" role="group" aria-label={t("priority")}>
                      {[
                        { value: "low", label: t("priorityLow") },
                        { value: "medium", label: t("priorityMedium") },
                        { value: "high", label: t("priorityHigh") },
                      ].map((option) => {
                        const isSelected = activeReviewDraft?.priority === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`review-state-badge is-priority-${option.value} ${isSelected ? "is-active" : ""}`}
                            aria-pressed={isSelected}
                            disabled={isSelected}
                            onClick={() => patchReviewDraft({ priority: option.value as Submission["priority"] })}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="review-badge-field">
                    <span>{t("signalValueLabel")}</span>
                    <div className="review-badge-options" role="group" aria-label={t("signalValueLabel")}>
                      <div className="review-star-rating" aria-label={t("signalValueRatingLabel")}>
                        {[1, 2, 3, 4, 5].map((value) => {
                          const currentValue = activeReviewDraft?.signalValue ?? 0;
                          const isSelected = activeReviewDraft?.signalValue === value;
                          const isFilled = currentValue >= value;
                          const canToggleOffToUnscored = value === 1 && activeReviewDraft?.signalValue === 1;
                          return (
                            <button
                              key={value}
                              type="button"
                              className={`review-star-button ${isFilled ? "is-filled" : ""} ${isSelected ? "is-selected" : ""}`}
                              aria-label={t("signalValueRatingOption", { value })}
                              aria-pressed={isSelected}
                              disabled={isSelected && !canToggleOffToUnscored}
                              onClick={() => patchReviewDraft({ signalValue: canToggleOffToUnscored ? undefined : value })}
                            >
                              {"\u2605"}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {reviewSessionStep === 3 ? (
            <div className="review-session-stage">
              <div className="review-stage-card">
                <div className="review-stage-header">
                  <p className="eyebrow">{t("stepLabel", { count: 3 })}</p>
                  <strong>{t("reviewerNoteLabel")}</strong>
                </div>
                <p className="review-session-internal-note">{t("reviewInternalOnlyNote")}</p>
                <label className="review-select">
                  <span>{t("assignedReviewerLabel")}</span>
                  <input
                    type="text"
                    value={activeReviewDraft?.reviewer ?? ""}
                    onChange={(event) => patchReviewDraft({ reviewer: event.target.value })}
                    placeholder={t("reviewerInputPlaceholder")}
                  />
                </label>
                <div className="review-notes-actions">
                  <span className="signal-chip signal-chip-soft">{selectedReviewerDisplayLabel || t("unassignedLabel")}</span>
                  {walletAccountAddress ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => patchReviewDraft({ reviewer: walletAccountAddress })}
                    >
                      {t("assignToMe")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`ghost-button ${selectedNeedsFollowUp ? "is-active" : ""}`}
                    disabled={saving}
                    onClick={onToggleNeedsFollowUp}
                  >
                    {selectedNeedsFollowUp ? t("followUpEnabledLabel") : t("needsFollowUpLabel")}
                  </button>
                </div>
                <label className="review-select">
                  <span>{t("internalNote")}</span>
                  <textarea
                    rows={7}
                    value={activeReviewDraft?.notes ?? ""}
                    onChange={(event) => patchReviewDraft({ notes: event.target.value })}
                    placeholder={t("captureReviewNotes")}
                  />
                </label>
                <p className="review-action-helper">{t("reviewEditableHelper")}</p>
                {hasSavedReviewResult ? (
                  <p className="review-action-helper muted">
                    {t("lastUpdatedLabel")}: {formatDate(selectedRecord.submission.updatedAt)}
                  </p>
                ) : null}
                <p className="review-action-helper">{t("reviewUnsavedDraftHelper")}</p>
              </div>
            </div>
          ) : null}

          {reviewSessionStep === 4 ? (
            <div className="review-session-stage">
              <div className="review-stage-card review-stage-card-compact-decision">
                <div className="review-stage-header">
                  <p className="eyebrow">{t("publicRoadmapDecisionStep")}</p>
                  <strong>{t("reviewPublicRoadmapDecisionTitle")}</strong>
                </div>
                <p className="muted">{t("publicRoadmapDecisionBody")}</p>
                <div className="review-session-decision-grid">
                  <button
                    type="button"
                    className={`review-state-badge ${!isDraftOnRoadmap && draftTriageStatus !== "closed" ? "is-active" : ""}`}
                    onClick={() => patchReviewDraft({ status: "read" })}
                  >
                    {t("keepInternal")}
                  </button>
                  <button
                    type="button"
                    className={`review-state-badge is-triage-planned ${isDraftOnRoadmap ? "is-active" : ""}`}
                    onClick={() =>
                      patchReviewDraft({
                        status: "read",
                        triageStatus:
                          draftTriageStatus === "planned" ||
                          draftTriageStatus === "in_progress" ||
                          draftTriageStatus === "fixed"
                            ? draftTriageStatus
                            : "planned",
                      })}
                  >
                    {t("publishToRoadmap")}
                  </button>
                  <button
                    type="button"
                    className={`review-state-badge is-triage-closed ${draftTriageStatus === "closed" ? "is-active" : ""}`}
                    onClick={() => patchReviewDraft({ status: "read", triageStatus: "closed" })}
                  >
                    {t("resolveInternally")}
                  </button>
                  <button
                    type="button"
                    className={`review-state-badge is-status-archived ${draftReviewStatus === "archived" ? "is-active" : ""}`}
                    onClick={() => patchReviewDraft({ status: "archived", triageStatus: "closed" })}
                  >
                    {t("archiveSignal")}
                  </button>
                </div>
                <div className="review-result-grid review-result-grid-compact">
                  <div className="review-result-item">
                    <span>{t("roadmapStatusLabel")}</span>
                    <strong>{isDraftOnRoadmap ? t("visibleOnRoadmap") : t("notOnRoadmap")}</strong>
                  </div>
                  <div className="review-result-item">
                    <span>{t("publicResultLabel")}</span>
                    <strong>{publicResultValue}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="review-session-footer">
            {reviewSessionStep === 1 ? (
              <button type="button" className="ghost-button" onClick={onRequestClose}>
                {t("closeLabel")}
              </button>
            ) : reviewSessionStep > 1 ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  setReviewSessionStep((current) => (Math.max(1, current - 1) as ReviewSessionStep))}
              >
                {t("back")}
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            <div className="review-session-footer-actions">
              {reviewSessionStep < 4 ? (
                <button
                  ref={primaryActionRef}
                  type="button"
                  className="primary-button"
                  disabled={!canAdvanceReviewSession}
                  onClick={() => setReviewSessionStep((current) => (Math.min(4, current + 1) as ReviewSessionStep))}
                >
                  {t("nextStepLabel")}
                </button>
              ) : (
                <button
                  ref={primaryActionRef}
                  type="button"
                  className={`primary-button review-save-button ${hasReviewDraftChanges ? "is-draft-ready" : ""}`}
                  disabled={saving || !hasReviewDraftChanges}
                  onClick={async () => {
                    const saved = await onSaveReview();
                    if (saved) {
                      onCompleteClose();
                    }
                  }}
                >
                  {saving ? t("reviewSaveSaving") : t("saveReview")}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


