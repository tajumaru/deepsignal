import { forwardRef } from "react";
import { SignalStatusBadges } from "../../../components/SignalStatusBadges";
import { useI18n } from "../../../i18n";
import { getReviewerPresenceText } from "../../../lib/reviewCollaboration";
import type { SignalCategory, SignalPersistenceState } from "../../../lib/signalInbox";
import { formatDate } from "../../../lib/utils";
import type { Submission } from "../../../types";

type TranslationFn = ReturnType<typeof useI18n>["t"];

interface SignalCardProps {
  t: TranslationFn;
  submission: Submission;
  category: SignalCategory;
  formTitle: string;
  subject: string;
  preview: string;
  triageStatusLabel: string;
  priorityLabel: string;
  lockStateLabel: string;
  readStateLabel: string;
  persistenceLabel: string | null;
  storageLabel?: string;
  persistenceState: SignalPersistenceState;
  reviewerHint: ReturnType<typeof getReviewerPresenceText>;
  needsFollowUp: boolean;
  isSelectedSignal: boolean;
  isPendingSui: boolean;
  isSelectedForSui: boolean;
  isAnonymousSignal: boolean;
  isUnlockedSignal: boolean;
  isOnchainRecoverySnapshot: boolean;
  hasPayloadIssue: boolean;
  hasNotableStatusBadge: boolean;
  isRegistering: boolean;
  onSelect: () => void;
  onKeySelect: () => void;
  onTogglePending: () => void;
  onRegisterPending: () => void;
}

export const SignalCard = forwardRef<HTMLDivElement, SignalCardProps>(function SignalCard(
  {
    t,
    submission,
    category,
    formTitle,
    subject,
    preview,
    triageStatusLabel,
    priorityLabel,
    lockStateLabel,
    readStateLabel,
    persistenceLabel,
    storageLabel,
    persistenceState,
    reviewerHint,
    needsFollowUp,
    isSelectedSignal,
    isPendingSui,
    isSelectedForSui,
    isAnonymousSignal,
    isUnlockedSignal,
    isOnchainRecoverySnapshot,
    hasPayloadIssue,
    hasNotableStatusBadge,
    isRegistering,
    onSelect,
    onKeySelect,
    onTogglePending,
    onRegisterPending,
  },
  ref,
) {
  return (
    <div
      className={`signal-card ${isSelectedSignal ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"} ${isPendingSui ? "has-select-checkbox" : ""} ${isSelectedForSui ? "is-selected-for-sui" : ""} ${
        isAnonymousSignal ? "is-anonymous" : ""
      }`}
      role="button"
      tabIndex={0}
      aria-current={isSelectedSignal ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        onKeySelect();
      }}
      ref={ref}
    >
      {isPendingSui ? (
        <div
          className="signal-card-select-toggle"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <input
            type="checkbox"
            checked={isSelectedForSui}
            onChange={onTogglePending}
            onClick={(event) => {
              event.stopPropagation();
            }}
            aria-label={t("selectForSui")}
          />
        </div>
      ) : null}
      <div className="signal-card-topline">
        <span className={`signal-card-read-dot status-${submission.status}`} aria-hidden="true" />
        <strong>{subject}</strong>
        <span className="signal-card-topline-meta">
          {isSelectedSignal ? <span className="signal-card-selection-badge">{t("selectedLabel")}</span> : null}
          <span className="signal-card-time">{formatDate(submission.createdAt)}</span>
        </span>
      </div>
      <p className={`signal-card-preview ${submission.isEncrypted ? "is-locked" : ""}`}>
        {preview}
      </p>
      <div className="signal-card-secondary-line">
        <span className="signal-card-form">{formTitle}</span>
        <span className="signal-card-meta-separator" aria-hidden="true">•</span>
        <span className="signal-card-triage">{triageStatusLabel}</span>
      </div>
      <div className="signal-card-footer">
        <div className="signal-card-mailbox-meta" aria-label={t("signalReviewStateLabel")}>
          <span className={`mailbox-meta-chip priority-${submission.priority}`}>
            {priorityLabel}
          </span>
          <span className={`mailbox-meta-chip ${isAnonymousSignal ? "identity-anonymous" : "identity-verified"}`}>
            {isAnonymousSignal ? t("anonymousLabel") : t("verifiedSignalsLabel")}
          </span>
          <span className={`mailbox-meta-chip ${submission.isEncrypted ? "is-locked" : "is-open"} ${isUnlockedSignal ? "is-unlocked" : ""}`}>
            {lockStateLabel}
          </span>
          <span className={`mailbox-meta-chip status-${submission.status}`}>
            {readStateLabel}
          </span>
          {isOnchainRecoverySnapshot ? (
            <span className="mailbox-meta-chip mailbox-meta-chip-subtle">
              {t("onchainRecoverySnapshotLabel")}
            </span>
          ) : null}
          {persistenceLabel ? (
            <span className="mailbox-meta-chip mailbox-meta-chip-subtle">{persistenceLabel}</span>
          ) : null}
          {hasPayloadIssue ? (
            <span className="mailbox-meta-chip mailbox-meta-chip-subtle">
              {t("privateSignalPayloadMissingStatus")}
            </span>
          ) : null}
        </div>
        {hasNotableStatusBadge ? (
          <div className="signal-badge-row signal-badge-row-compact">
            <SignalStatusBadges
              submission={submission}
              category={category}
              pendingSui={isPendingSui}
              selectedForSui={isSelectedForSui}
              payloadIssue={hasPayloadIssue}
              storageLabel={storageLabel}
              persistenceState={persistenceState}
              density="notable"
              reviewerHint={reviewerHint}
              needsFollowUp={needsFollowUp}
            />
          </div>
        ) : null}
      </div>
      <div
        className="signal-card-actions signal-card-actions-quick"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
      </div>
      {isPendingSui ? (
        <div className="signal-card-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={isRegistering}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRegisterPending();
            }}
          >
            {isRegistering ? t("registeringStatus") : t("registerOnSui")}
          </button>
        </div>
      ) : null}
    </div>
  );
});
