import { useMemo } from "react";
import { useI18n } from "../i18n";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import { getTriageStatusLabel } from "../lib/signalOps";
import { getSignalPreview, getSignalSubject } from "../lib/signalInbox";
import { formatDate } from "../lib/utils";
import { findRelatedSignals, type RelatedSignalReason } from "../features/admin/lib/relatedSignals";
import type { SignalRecord } from "../features/admin/hooks/useSignalInboxData";

interface RelatedSignalsPanelProps {
  selectedRecord: SignalRecord;
  visibleSignals: SignalRecord[];
  allSignals: SignalRecord[];
  signalById?: Record<string, SignalRecord | undefined>;
  onSelectSignal: (submissionId: string) => void;
}

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
    case "same_severity":
      return t("relatedReasonSameSeverity");
    case "same_sender_type":
      return t("relatedReasonSameSenderType");
    case "shared_keywords":
      return t("relatedReasonSharedKeywords");
    case "shared_tags":
      return t("relatedReasonSharedTags");
    case "exact_subject":
      return t("relatedReasonExactSubject");
    case "similar_text":
    default:
      return t("relatedReasonKeywordOverlap");
  }
}

export function RelatedSignalsPanel({
  selectedRecord,
  visibleSignals,
  allSignals,
  signalById,
  onSelectSignal,
}: RelatedSignalsPanelProps) {
  const { t } = useI18n();
  const { matches, duplicateHint } = useMemo(
    () =>
      findRelatedSignals({
        selectedRecord,
        visibleSignals,
        allSignals,
        signalById,
        maxResults: 5,
      }),
    [allSignals, selectedRecord, signalById, visibleSignals],
  );

  const hintLabel =
    duplicateHint === "possible_duplicate"
      ? t("relatedSignalsHintPossibleDuplicate")
      : duplicateHint === "count"
        ? t("relatedSignalsHintCount", { count: matches.length })
        : duplicateHint === "similar"
          ? t("relatedSignalsHintSimilar")
          : null;

  return (
    <section className="related-signals-panel" aria-label={t("relatedSignalsTitle")}>
      <div className="related-signals-header">
        <div>
          <p className="eyebrow">{t("reviewSupportEyebrow")}</p>
          <h3>{t("relatedSignalsTitle")}</h3>
          <p className="muted">{t("relatedSignalsBody")}</p>
        </div>
        <span className="signal-chip signal-chip-soft">{t("resultsLabel", { count: matches.length })}</span>
      </div>

      {hintLabel ? <p className="related-signals-hint">{hintLabel}</p> : null}

      {matches.length === 0 ? (
        <p className="muted related-signals-empty">{t("relatedSignalsEmpty")}</p>
      ) : (
        <div className="related-signals-list">
          {matches.map((match) => {
            const { record } = match;
            const respondentMeta = getSubmissionRespondentMeta(record.submission);
            const preview = getSignalPreview(record.submission);
            const reasonChips = [
              ...match.reasons.slice(0, 3).map((reason) => getReasonLabel(reason, t)),
              ...match.sharedKeywords.slice(0, 2),
              ...match.sharedTags.slice(0, 1),
            ].slice(0, 5);

            return (
              <button
                key={record.submission.id}
                type="button"
                className="related-signal-card"
                onClick={() => onSelectSignal(record.submission.id)}
              >
                <span className="related-signal-card-main">
                  <span className="related-signal-title-line">
                    <strong>{getSignalSubject(record.submission)}</strong>
                    <time dateTime={record.submission.createdAt}>{formatDate(record.submission.createdAt)}</time>
                  </span>
                  <span className={`related-signal-preview ${record.submission.isEncrypted ? "is-locked" : ""}`}>
                    {preview}
                  </span>
                  <span className="related-signal-channel">{record.form.title}</span>
                  <span className="related-signal-meta">
                    <span className="signal-chip">{getTriageStatusLabel(record.submission.triageStatus)}</span>
                    <span className="signal-chip">{getPriorityLabel(record.submission.priority, t)}</span>
                    <span className={`signal-chip ${respondentMeta.isAnonymous ? "" : "signal-chip-soft"}`}>
                      {respondentMeta.isAnonymous ? t("anonymousLabel") : t("verifiedSignalsLabel")}
                    </span>
                    {record.submission.isEncrypted ? (
                      <span className="signal-chip">{t("encryptedPrivateSignalStatus")}</span>
                    ) : null}
                  </span>
                  <span className="related-signal-reasons">
                    {reasonChips.map((chip) => (
                      <span key={`${record.submission.id}-${chip}`} className="related-reason-chip">
                        {chip}
                      </span>
                    ))}
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
