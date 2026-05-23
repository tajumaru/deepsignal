import type { CSSProperties } from "react";
import { useI18n } from "../../../i18n";
import { getSignalPreview } from "../../../lib/signalInbox";
import { flattenAnswer } from "../../../lib/utils";
import type { SignalSeverity } from "../../../types";
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

interface SignalCluster {
  label: string;
  summary: string;
  keywords: string[];
  signalCount: number;
  confidence: number;
  severity: SignalSeverity;
  trend: "increasing" | "steady";
}

interface ActivityPoint {
  label: string;
  count: number;
  intensity: number;
  anomaly: boolean;
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

function getSeverityRank(severity?: SignalSeverity) {
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function getClusterSeverity(records: SignalRecord[], label: string): SignalSeverity {
  const normalizedLabel = label.toLowerCase();
  const matchingRecords = records.filter((record) => {
    const keywords = record.submission.keywords ?? [];
    const corpus = [
      record.submission.subjectPreview,
      record.submission.aiSummary,
      record.submission.tags.join(" "),
      keywords.join(" "),
      getSignalPreview(record.submission),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return normalizedLabel
      .split(/\s+/)
      .filter((token) => token.length > 2)
      .some((token) => corpus.includes(token));
  });

  return matchingRecords
    .map((record) => record.submission.severity ?? record.submission.priority)
    .sort((left, right) => getSeverityRank(right) - getSeverityRank(left))[0] ?? "medium";
}

function extractClusterKeywords(item: SignalSummaryContentCount) {
  const words = `${item.question} ${item.answer}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !["signal", "report", "after", "with", "from", "this", "that"].includes(word));
  return [...new Set(words)].slice(0, 3);
}

function buildSignalClusters(records: SignalRecord[], items: SignalSummaryContentCount[], t: ReturnType<typeof useI18n>["t"]): SignalCluster[] {
  const clusters = items.slice(0, 4).map((item) => {
    const keywords = extractClusterKeywords(item);
    const label = shortenSummaryText(item.answer, 42);
    const confidence = Math.min(94, Math.max(62, Math.round((item.count / Math.max(item.total, 1)) * 58 + 36)));
    return {
      label,
      summary: item.question,
      keywords: keywords.length > 0 ? keywords : [t("workspaceClusterKeywordEncrypted"), t("workspaceClusterKeywordSignal")],
      signalCount: item.count,
      confidence,
      severity: getClusterSeverity(records, item.answer),
      trend: item.count > 1 ? "increasing" : "steady",
    } satisfies SignalCluster;
  });

  if (clusters.length > 0) {
    return clusters;
  }

  const encryptedCount = records.filter((record) => record.submission.isEncrypted).length;
  return [
    {
      label: t("workspaceFallbackClusterLabel"),
      summary: t("workspaceFallbackClusterSummary"),
      keywords: [
        t("workspaceClusterKeywordSealed"),
        t("workspaceClusterKeywordLocked"),
        t("workspaceClusterKeywordReview"),
      ],
      signalCount: encryptedCount,
      confidence: encryptedCount > 0 ? 71 : 48,
      severity: encryptedCount > 0 ? "medium" : "low",
      trend: encryptedCount > 0 ? "steady" : "steady",
    },
  ];
}

function buildActivityPoints(records: SignalRecord[]): ActivityPoint[] {
  const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: dayFormatter.format(date),
      count: 0,
    };
  });
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  records.forEach((record) => {
    const date = new Date(record.submission.createdAt);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    date.setHours(0, 0, 0, 0);
    const bucket = bucketByKey.get(date.toISOString().slice(0, 10));
    if (bucket) {
      bucket.count += 1;
    }
  });

  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const average = buckets.reduce((sum, bucket) => sum + bucket.count, 0) / buckets.length;
  return buckets.map((bucket) => ({
    ...bucket,
    intensity: Math.max(12, Math.round((bucket.count / maxCount) * 100)),
    anomaly: bucket.count > 0 && bucket.count >= Math.max(2, average * 1.8),
  }));
}

function getPrimaryIntelligenceCopy(cluster: SignalCluster | undefined, encryptedWaitingCount: number, t: ReturnType<typeof useI18n>["t"]) {
  if (cluster && cluster.signalCount > 0) {
    return t("workspaceSignalIntelligenceDetected", {
      phrase: cluster.label,
      area: cluster.keywords.slice(0, 2).join(" / ") || t("workspaceReviewFlowArea"),
    });
  }
  if (encryptedWaitingCount > 0) {
    return t("workspaceSignalIntelligenceLocked", { count: encryptedWaitingCount });
  }
  return t("workspaceSignalIntelligenceIdle");
}

function getRecordReviewTitle(record: SignalRecord, t: ReturnType<typeof useI18n>["t"], unlockedSignalsById?: Record<string, UnlockedSignalSummary>) {
  const readableEntry = getReadableSummaryEntries(record, t, unlockedSignalsById)[0];
  return readableEntry?.answer || record.submission.subjectPreview || getSignalPreview(record.submission);
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
  const signalSummary = buildSignalSummary(records, t, unlockedSignalsById);
  const clusters = buildSignalClusters(records, signalSummary.items, t);
  const primaryCluster = clusters[0];
  const activityPoints = buildActivityPoints(records);
  const anomalyCount = activityPoints.filter((point) => point.anomaly).length;
  const attentionRecords = records
    .filter((record) => record.submission.status === "unread" || record.submission.triageStatus === "new")
    .slice(0, 3);
  const metrics = [
    {
      label: t("workspaceMetricAttentionRequired"),
      value: Math.max(unreadSignals, needsReviewSignals).toLocaleString(),
      detail: t("workspaceMetricAttentionRequiredDetail", { anomalies: anomalyCount }),
      tone: "alert",
    },
    {
      label: t("workspaceMetricActiveCluster"),
      value: primaryCluster?.signalCount.toLocaleString() ?? "0",
      detail: primaryCluster
        ? t("workspaceMetricActiveClusterDetail", { cluster: primaryCluster.label })
        : t("workspaceMetricActiveClusterEmpty"),
      tone: "cluster",
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
        <span className="signal-chip signal-chip-soft">{t("workspaceSignalConsole")}</span>
      </div>
      <div className="workspace-insights-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`workspace-insight-card is-${metric.tone}`}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </div>
      <article className="workspace-signal-intelligence-card">
        <div className="workspace-signal-intelligence-copy">
          <p className="eyebrow">{t("workspaceSignalIntelligenceEyebrow")}</p>
          <h3>{t("workspaceSignalIntelligenceTitle")}</h3>
          <p>{getPrimaryIntelligenceCopy(primaryCluster, signalSummary.encryptedWaitingCount, t)}</p>
        </div>
        <div className="workspace-signal-readout">
          <span>{t("workspaceConfidenceLabel")}</span>
          <strong>{primaryCluster?.confidence ?? 0}%</strong>
          <small>{t("workspacePotentialAreaLabel")}: {primaryCluster?.keywords.slice(0, 2).join(" / ") || t("workspaceEncryptedIntakeArea")}</small>
        </div>
        <div className="workspace-intelligence-meta">
          <span>{t("workspaceSeverityLabel")}: {t(`workspaceSeverity${primaryCluster?.severity ?? "low"}`)}</span>
          <span>{t("workspaceTrendLabel")}: {t(`workspaceTrend${primaryCluster?.trend ?? "steady"}`)}</span>
          <span>{t("workspaceEncryptedCoverage", { count: encryptedSignals, total: totalSignals })}</span>
        </div>
      </article>
      <article className="workspace-sonar-card">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">{t("workspaceSignalActivityEyebrow")}</p>
            <h3>{t("workspaceSignalActivityTitle")}</h3>
          </div>
          <span className="signal-chip signal-chip-soft">{t("workspaceAnomalyCount", { count: anomalyCount })}</span>
        </div>
        <div className="workspace-sonar-wave" aria-label={t("workspaceSignalActivityTitle")}>
          {activityPoints.map((point) => (
            <span
              key={point.label}
              className={point.anomaly ? "is-anomaly" : undefined}
              style={{ "--density": `${point.intensity}%` } as CSSProperties}
              title={`${point.label}: ${point.count}`}
            >
              <i />
              <small>{point.label}</small>
            </span>
          ))}
        </div>
      </article>
      <div className="workspace-intelligence-lower-grid">
        <article className="workspace-signal-summary-card">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">{t("workspaceEmergingClustersEyebrow")}</p>
            <h3>{t("workspaceEmergingClustersTitle")}</h3>
          </div>
        </div>
        {clusters.length > 0 ? (
          <div className="workspace-signal-summary-grid">
            {clusters.map((cluster) => (
              <article key={`${cluster.label}-${cluster.signalCount}`} className="workspace-signal-answer-card">
                <div>
                  <span>{shortenSummaryText(cluster.summary, 96)}</span>
                  <strong>{cluster.label}</strong>
                  <div className="workspace-cluster-keywords">
                    {cluster.keywords.map((keyword) => (
                      <small key={keyword}>{keyword}</small>
                    ))}
                  </div>
                </div>
                <em>{t("workspaceClusterSignalCount", { count: cluster.signalCount })}</em>
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
        <article className="workspace-review-queue-card">
          <div className="workspace-signal-summary-header">
            <div>
              <p className="eyebrow">{t("workspaceNeedsAttentionEyebrow")}</p>
              <h3>{t("workspaceNeedsAttentionTitle")}</h3>
            </div>
          </div>
          {attentionRecords.length > 0 ? (
            <div className="workspace-review-queue-list">
              {attentionRecords.map((record) => (
                <div key={record.submission.id} className="workspace-review-queue-item">
                  <span />
                  <div>
                    <strong>{shortenSummaryText(getRecordReviewTitle(record, t, unlockedSignalsById), 76)}</strong>
                    <small>
                      {record.submission.isEncrypted
                        ? t("workspaceQueueEncryptedSimilar", { count: Math.max(1, primaryCluster?.signalCount ?? 1) })
                        : t("workspaceQueueReadableSimilar", { count: Math.max(1, primaryCluster?.signalCount ?? 1) })}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="workspace-signal-summary-empty">{t("workspaceNeedsAttentionEmpty")}</p>
          )}
        </article>
      </div>
    </section>
  );
}
