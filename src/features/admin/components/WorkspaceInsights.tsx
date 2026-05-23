import { useI18n } from "../../../i18n";
import { getSignalPreview } from "../../../lib/signalInbox";
import { flattenAnswer } from "../../../lib/utils";
import type { SignalRecord } from "../hooks/useSignalInboxData";

interface UnlockedSignalSummary {
  answers: Record<string, unknown>;
}

interface SignalSummaryContentCount {
  question: string;
  answer: string;
  count: number;
  total: number;
}

function shortenSummaryText(text: string, maxLength = 88) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function normalizeReadableAnswer(value: unknown) {
  const answer = flattenAnswer(value).trim().replace(/\s+/g, " ");
  return answer && answer.toLowerCase() !== "no answer" ? answer : "";
}

function getReadableSummaryEntries(
  record: SignalRecord,
  t: ReturnType<typeof useI18n>["t"],
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>,
) {
  const answers =
    unlockedSignalsById?.[record.submission.id]
      ? unlockedSignalsById[record.submission.id].answers
      : record.submission.isEncrypted || record.submission.status === "archived"
        ? null
        : record.submission.answers;

  if (!answers) {
    return [];
  }

  const entries = record.form.fields
    .map((field) => ({
      question: field.label.trim() || field.id,
      answer: normalizeReadableAnswer(answers[field.id]),
    }))
    .filter((entry) => entry.answer);

  if (entries.length > 0) {
    return entries;
  }

  const preview = normalizeReadableAnswer(getSignalPreview(record.submission));
  return preview ? [{ question: t("workspaceSignalFallbackQuestion"), answer: preview }] : [];
}

function buildSignalSummary(
  records: SignalRecord[],
  t: ReturnType<typeof useI18n>["t"],
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>,
) {
  const encryptedWaitingCount = records.filter(
    (record) =>
      record.submission.isEncrypted &&
      record.submission.status !== "archived" &&
      !unlockedSignalsById?.[record.submission.id],
  ).length;
  const contentCounts = new Map<string, SignalSummaryContentCount>();
  const questionTotals = new Map<string, number>();

  records.forEach((record) => {
    const entries = getReadableSummaryEntries(record, t, unlockedSignalsById);
    const countedQuestions = new Set<string>();
    entries.forEach((entry) => {
      const question = entry.question.trim();
      const answer = entry.answer.trim();
      if (!question || !answer) {
        return;
      }
      const questionKey = question.toLowerCase();
      if (!countedQuestions.has(questionKey)) {
        countedQuestions.add(questionKey);
        questionTotals.set(questionKey, (questionTotals.get(questionKey) ?? 0) + 1);
      }
      const key = `${question.toLowerCase()}::${answer.toLowerCase()}`;
      const current = contentCounts.get(key);
      contentCounts.set(key, {
        question: current?.question ?? question,
        answer: current?.answer ?? answer,
        count: (current?.count ?? 0) + 1,
        total: 0,
      });
    });
  });

  const items = [...contentCounts.values()]
    .map((item) => ({
      ...item,
      total: questionTotals.get(item.question.toLowerCase()) ?? item.count,
    }))
    .sort(
      (first, second) =>
        second.count - first.count ||
        first.question.localeCompare(second.question) ||
        first.answer.localeCompare(second.answer),
    )
    .slice(0, 6);

  if (items.length === 0) {
    return {
      items: [] as SignalSummaryContentCount[],
      encryptedWaitingCount,
      emptyText: t("workspaceSignalSummaryEmpty"),
    };
  }

  return {
    items,
    encryptedWaitingCount,
    emptyText: "",
  };
}

interface WorkspaceInsightsProps {
  totalSignals: number;
  unreadSignals: number;
  needsReviewSignals: number;
  encryptedSignals: number;
  records: SignalRecord[];
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>;
}

export function WorkspaceInsights({
  totalSignals,
  unreadSignals,
  needsReviewSignals,
  encryptedSignals,
  records,
  unlockedSignalsById,
}: WorkspaceInsightsProps) {
  const { t } = useI18n();
  const encryptedPercent = totalSignals > 0 ? Math.round((encryptedSignals / totalSignals) * 100) : 0;
  const signalSummary = buildSignalSummary(records, t, unlockedSignalsById);
  const metrics = [
    {
      label: t("workspaceMetricTotalSignals"),
      value: totalSignals.toLocaleString(),
      detail: t("workspaceMetricTotalSignalsDetail"),
    },
    {
      label: t("workspaceMetricNeedsReview"),
      value: `${unreadSignals.toLocaleString()} / ${needsReviewSignals.toLocaleString()}`,
      detail: t("workspaceMetricNeedsReviewDetail"),
    },
    {
      label: t("workspaceMetricEncrypted"),
      value: encryptedSignals.toLocaleString(),
      detail: t("workspaceMetricEncryptedDetail", { percent: encryptedPercent }),
    },
  ];

  return (
    <section className="panel workspace-insights-panel" aria-labelledby="workspace-insights-title">
      <div className="workspace-insights-header">
        <div>
          <p className="eyebrow">{t("workspaceInsightsEyebrow")}</p>
          <h2 id="workspace-insights-title">{t("workspaceInsightsTitle")}</h2>
          <p className="workspace-insights-intro">{t("workspaceInsightsIntro")}</p>
        </div>
        <span className="signal-chip signal-chip-soft">{t("workspaceSignalSnapshot")}</span>
      </div>
      <div className="workspace-insights-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="workspace-insight-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </div>
      <article className="workspace-signal-summary-card">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">{t("workspaceReviewAssistEyebrow")}</p>
            <h3>{t("workspaceSignalSummaryTitle")}</h3>
          </div>
        </div>
        {signalSummary.items.length > 0 ? (
          <div className="workspace-signal-summary-grid">
            {signalSummary.items.map((item) => (
              <article key={`${item.question}-${item.answer}`} className="workspace-signal-answer-card">
                <div>
                  <span>{shortenSummaryText(item.question, 96)}</span>
                  <strong>{shortenSummaryText(item.answer, 120)}</strong>
                </div>
                <em>{item.count} / {t("workspaceSignalsCount", { count: item.total })}</em>
              </article>
            ))}
          </div>
        ) : (
          <p className="workspace-signal-summary-empty">{signalSummary.emptyText}</p>
        )}
        {signalSummary.encryptedWaitingCount > 0 ? (
          <p className="workspace-signal-summary-empty">
            {t("workspaceEncryptedSignalsStillLocked", { count: signalSummary.encryptedWaitingCount })}
          </p>
        ) : null}
      </article>
    </section>
  );
}
