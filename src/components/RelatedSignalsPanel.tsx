import { useI18n } from "../i18n";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import { getSignalPreview, getSignalSubject } from "../lib/signalInbox";
import { type RelatedSignalReason, type RelatedSignalResult } from "../lib/relatedSignals";
import { formatDate } from "../lib/utils";
import type { SignalRecord } from "../features/admin/hooks/useSignalInboxData";

interface RelatedSignalsPanelProps {
  relatedSignals: RelatedSignalResult[];
  selectedSignalId?: string;
  onSelectRecord: (record: SignalRecord) => void;
}

const REASON_DISPLAY_ORDER: RelatedSignalReason[] = [
  "same_channel",
  "similar_subject",
  "similar_preview",
  "shared_tags",
  "same_category",
  "same_triage",
  "same_priority",
  "same_sender_type",
];

const MAX_VISIBLE_REASON_CHIPS = 4;

function getPriorityLabel(priority: SignalRecord["submission"]["priority"], t: ReturnType<typeof useI18n>["t"]) {
  switch (priority) {
    case "high":
      return t("priorityHigh");
    case "low":
      return t("priorityLow");
    case "medium":
    default:
      return t("priorityMedium");
  }
}

function getTriageStatusLabel(triageStatus: SignalRecord["submission"]["triageStatus"], t: ReturnType<typeof useI18n>["t"]) {
  switch (triageStatus) {
    case "investigating":
      return t("triageStatusInvestigating");
    case "planned":
      return t("triageStatusPlanned");
    case "in_progress":
      return t("triageStatusInProgress");
    case "fixed":
      return t("triageStatusFixed");
    case "closed":
      return t("triageStatusClosed");
    case "new":
    default:
      return t("triageStatusNew");
  }
}

function getReasonLabel(reason: RelatedSignalReason, t: ReturnType<typeof useI18n>["t"]) {
  switch (reason) {
    case "same_channel":
      return t("relatedReasonSameChannel");
    case "same_category":
      return t("relatedReasonSameCategory");
    case "same_triage":
      return t("relatedReasonSameTriage");
    case "same_priority":
      return t("relatedReasonSamePriority");
    case "same_sender_type":
      return t("relatedReasonSameSenderType");
    case "shared_tags":
      return t("relatedReasonSharedTags");
    case "similar_subject":
      return t("relatedReasonSimilarSubject");
    case "similar_preview":
    default:
      return t("relatedReasonSimilarPreview");
  }
}

function getSafePreview(record: SignalRecord, t: ReturnType<typeof useI18n>["t"]) {
  if (record.submission.isEncrypted) {
    return record.submission.subjectPreview?.trim() || t("relatedSignalsEncryptedState");
  }
  return getSignalPreview(record.submission);
}

function getVisibleReasons(reasons: RelatedSignalReason[]) {
  return [...reasons]
    .sort((left, right) => REASON_DISPLAY_ORDER.indexOf(left) - REASON_DISPLAY_ORDER.indexOf(right))
    .slice(0, MAX_VISIBLE_REASON_CHIPS);
}

export function RelatedSignalsPanel({ relatedSignals, selectedSignalId, onSelectRecord }: RelatedSignalsPanelProps) {
  const { t } = useI18n();
  const duplicateDetected = relatedSignals.some((signal) => signal.duplicateLikely);

  return (
    <section className="related-signals-panel" aria-label={t("relatedSignalsTitle")}>
      <div className="related-signals-header">
        <div>
          <h3>{t("relatedSignalsTitle")}</h3>
          <p className="muted">{t("relatedSignalsSubtitle")}</p>
        </div>
        <span className="signal-chip signal-chip-soft">{t("relatedSignalsCount", { count: relatedSignals.length })}</span>
      </div>

      {duplicateDetected ? <p className="related-signals-notice">{t("relatedSignalsHintPossibleDuplicate")}</p> : null}

      {relatedSignals.length === 0 ? (
        <p className="muted related-signals-empty">{t("relatedSignalsEmpty")}</p>
      ) : (
        <div className="related-signal-list">
          {relatedSignals.map((match) => {
            const { record, reasons } = match;
            const visibleReasons = getVisibleReasons(reasons);
            const hiddenReasonCount = Math.max(0, reasons.length - visibleReasons.length);
            const respondentMeta = getSubmissionRespondentMeta(record.submission);
            const preview = getSafePreview(record, t);
            const encryptedState = record.submission.isEncrypted
              ? t("relatedSignalsEncryptedState")
              : t("relatedSignalsOpenState");

            return (
              <button
                key={record.submission.id}
                type="button"
                className={`related-signal-item ${selectedSignalId === record.submission.id ? "is-selected" : ""}`}
                aria-pressed={selectedSignalId === record.submission.id}
                onClick={() => onSelectRecord(record)}
              >
                <span className="related-signal-item-main">
                  <span className="related-signal-title-line">
                    <strong>{getSignalSubject(record.submission)}</strong>
                    <time dateTime={record.submission.createdAt}>{formatDate(record.submission.createdAt)}</time>
                  </span>
                  <span className={`related-signal-preview ${record.submission.isEncrypted ? "is-locked" : ""}`}>
                    {preview}
                  </span>
                  <span className="related-signal-channel">{record.form.title}</span>
                  <span className="related-signal-meta">
                    <span className="signal-chip">{getTriageStatusLabel(record.submission.triageStatus, t)}</span>
                    <span className="signal-chip">{getPriorityLabel(record.submission.priority, t)}</span>
                    <span className={`signal-chip ${respondentMeta.isAnonymous ? "" : "signal-chip-soft"}`}>
                      {respondentMeta.isAnonymous ? t("anonymousLabel") : t("verifiedSignalsLabel")}
                    </span>
                    <span className="signal-chip signal-chip-soft">{encryptedState}</span>
                  </span>
                  <span className="related-signal-reasons">
                    {visibleReasons.map((reason) => (
                      <span
                        key={`${record.submission.id}-${reason}`}
                        className="related-signal-reason-chip"
                      >
                        {getReasonLabel(reason, t)}
                      </span>
                    ))}
                    {hiddenReasonCount > 0 ? (
                      <span className="related-signal-reason-chip related-signal-reason-chip-muted">
                        +{hiddenReasonCount}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
