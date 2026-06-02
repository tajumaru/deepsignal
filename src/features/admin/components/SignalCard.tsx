import { forwardRef } from "react";
import { useI18n } from "../../../i18n";
import type { SignalPersistenceState } from "../../../lib/signalInbox";
import { formatDate } from "../../../lib/utils";
import type { Submission } from "../../../types";

type TranslationFn = ReturnType<typeof useI18n>["t"];

interface SignalCardProps {
  t: TranslationFn;
  submission: Submission;
  formTitle: string;
  subject: string;
  preview: string;
  triageStatusLabel: string;
  processingModeLabel: string;
  priorityLabel: string;
  lockStateLabel: string;
  readStateLabel: string;
  persistenceLabel: string | null;
  persistenceState: SignalPersistenceState;
  urgencyScoreLabel: string;
  signalTypeLabel: string;
  analystTypeLabel: string;
  shortSummary: string;
  evidenceQuote: string;
  recommendedAction: string;
  isSelectedSignal: boolean;
  isPendingSui: boolean;
  isSelectedForSui: boolean;
  isAnonymousSignal: boolean;
  isUnlockedSignal: boolean;
  isOnchainRecoverySnapshot: boolean;
  isDemoSignal?: boolean;
  isDemoJustArrived?: boolean;
  isSystemSignal?: boolean;
  systemSeverityLabel?: string;
  onCopyDiagnostics?: () => void;
  hasPayloadIssue: boolean;
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
    formTitle,
    subject,
    preview,
    triageStatusLabel,
    processingModeLabel,
    priorityLabel,
    lockStateLabel,
    readStateLabel,
    persistenceLabel,
    persistenceState,
    urgencyScoreLabel,
    signalTypeLabel,
    analystTypeLabel,
    shortSummary,
    evidenceQuote,
    recommendedAction,
    isSelectedSignal,
    isPendingSui,
    isSelectedForSui,
    isUnlockedSignal,
    isOnchainRecoverySnapshot,
    isDemoSignal = false,
    isDemoJustArrived = false,
    isSystemSignal = false,
    systemSeverityLabel = "",
    onCopyDiagnostics,
    hasPayloadIssue,
    isRegistering,
    onSelect,
    onKeySelect,
    onTogglePending,
    onRegisterPending,
  },
  ref,
) {
  const showCompactStateMeta =
    submission.isEncrypted ||
    submission.status === "archived" ||
    submission.revokeRequested ||
    isDemoSignal ||
    isOnchainRecoverySnapshot ||
    hasPayloadIssue ||
    (persistenceLabel !== null && persistenceState !== "walrus_synced");

  return (
    <div
      className={`signal-card ${isSelectedSignal ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"} ${isPendingSui ? "has-select-checkbox" : ""} ${isSelectedForSui ? "is-selected-for-sui" : ""} ${isDemoJustArrived ? "is-demo-just-arrived" : ""} ${isSystemSignal ? "is-system-signal" : ""}`}
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
          onKeyDown={(event) => {
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
            onKeyDown={(event) => {
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
          {isSystemSignal ? <span className="signal-card-selection-badge is-system">System</span> : null}
          {isSystemSignal && systemSeverityLabel ? (
            <span className={`signal-card-selection-badge is-system-severity severity-${systemSeverityLabel.toLowerCase()}`}>
              {systemSeverityLabel}
            </span>
          ) : null}
          {isDemoSignal ? <span className="signal-card-selection-badge is-demo">{t("demoBadgeLabel")}</span> : null}
          {isDemoJustArrived ? <span className="signal-card-selection-badge is-just-arrived">{t("demoJustArrivedLabel")}</span> : null}
          <span className="signal-card-time">{formatDate(submission.createdAt)}</span>
        </span>
      </div>
      <div className="signal-card-secondary-line">
        <span className={`mailbox-meta-chip priority-${submission.priority}`}>{urgencyScoreLabel}</span>
        <span className="signal-card-triage">{signalTypeLabel}</span>
        <span className="signal-card-triage">{analystTypeLabel}</span>
      </div>
      <div className="signal-card-secondary-line signal-card-secondary-line-muted">
        <span className={`mailbox-meta-chip priority-${submission.priority}`}>{priorityLabel}</span>
        <span className="signal-card-triage">{triageStatusLabel}</span>
        <span className="signal-card-triage signal-card-processing-mode">{processingModeLabel}</span>
        <span className="signal-card-form">{formTitle}</span>
      </div>
      <p className={`signal-card-preview ${submission.isEncrypted ? "is-locked" : ""}`}>{shortSummary || preview}</p>
      <div className="signal-card-intelligence">
        <p className="signal-card-evidence">{t("signalCardEvidenceLine", { evidence: evidenceQuote })}</p>
        <p className="signal-card-action">{t("signalCardNextActionLine", { action: recommendedAction })}</p>
      </div>
      {showCompactStateMeta ? (
        <div className="signal-card-footer">
          <div className="signal-card-mailbox-meta" aria-label={t("signalReviewStateLabel")}>
            {submission.isEncrypted ? (
              <span className={`mailbox-meta-chip mailbox-meta-chip-subtle ${isUnlockedSignal ? "is-unlocked" : "is-locked"}`}>
                {lockStateLabel}
              </span>
            ) : null}
            {submission.status === "archived" ? (
              <span className="mailbox-meta-chip mailbox-meta-chip-subtle status-read">{readStateLabel}</span>
            ) : null}
            {submission.revokeRequested ? (
              <span className="mailbox-meta-chip mailbox-meta-chip-subtle is-revoke-requested">{t("revokeRequestedLabel")}</span>
            ) : null}
            {isOnchainRecoverySnapshot ? (
              <span className="mailbox-meta-chip mailbox-meta-chip-subtle">{t("onchainRecoverySnapshotLabel")}</span>
            ) : null}
            {isDemoSignal ? (
              <span className="mailbox-meta-chip mailbox-meta-chip-subtle">{t("demoSignalNotStoredLabel")}</span>
            ) : null}
            {persistenceLabel && persistenceState !== "walrus_synced" ? (
              <span className="mailbox-meta-chip mailbox-meta-chip-subtle">{persistenceLabel}</span>
            ) : null}
            {hasPayloadIssue ? (
              <span className="mailbox-meta-chip mailbox-meta-chip-subtle">{t("privateSignalPayloadMissingStatus")}</span>
            ) : null}
          </div>
        </div>
      ) : null}
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
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          >
            {isRegistering ? t("registeringStatus") : t("registerOnSui")}
          </button>
        </div>
      ) : null}
      {isSystemSignal && onCopyDiagnostics ? (
        <div className="signal-card-actions">
          <button
            type="button"
            className="ghost-button system-diagnostics-copy-button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCopyDiagnostics();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          >
            Copy redacted diagnostics
          </button>
        </div>
      ) : null}
    </div>
  );
});
