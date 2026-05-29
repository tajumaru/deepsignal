import { useMemo, type CSSProperties } from "react";
import { useI18n, type Language } from "../../../i18n";
import { getRelatedSignals, type RelatedSignalReason } from "../../../lib/relatedSignals";
import { getSignalPreview } from "../../../lib/signalInbox";
import type { VersionedFormSchemas } from "../../../lib/formVersionSchemas";
import { getSubmissionVersion } from "../../../lib/submissionVersioning";
import { downloadTextFile } from "../../../lib/utils";
import { formatAnswerText } from "../../../lib/answerFormatting";
import type { FormSchema, SignalSeverity } from "../../../types";
import {
  getAnalysisProfileLabel,
  getAnalysisProfileShortLabel,
  getAnalystTypeLabel,
  getAnalysisSignalTypeLabel,
  getAnalysisTypeLabel,
  getSignalProfileId,
  resolveAnalysisProfile,
  resolveProfileDistribution,
} from "./analysisProfiles";
import { buildWorkspaceAnalysisExperience } from "./signalIntelligence";
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

interface SilenceCandidate {
  key: string;
  label: string;
  tone: "estimated_silence" | "inactive" | "low_activity";
  detail: string;
  unresolvedCount: number;
  recentCount: number;
  lastSeenLabel: string;
}

interface VelocitySnapshot {
  count: number;
  medianLagHours: number | null;
  withinDayPercent: number;
  bucketCounts: Array<{ label: string; count: number }>;
}

interface RelatedPatternSummary {
  key: string;
  label: string;
  count: number;
}

interface ActivityStatus {
  label: string;
  labelJa: string;
  detail: string;
  tone: "stable" | "up" | "drop" | "spike";
}

type MonitorStateTone = "stable" | "elevated" | "critical" | "recovering";

interface MonitorState {
  tone: MonitorStateTone;
  key: "Stable" | "Elevated" | "Critical" | "Recovering";
}

interface SituationFlowStep {
  key: string;
  tone: MonitorStateTone;
  titleKey: string;
  bodyKey: string;
}

interface InsightExportClusterNode {
  key: string;
  left: string;
  top: string;
  scale: number;
  connected: boolean;
}

function shortenSummaryText(text: string, maxLength = 88) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function normalizeReadableAnswer(
  value: unknown,
  language: Language,
  field?: FormSchema["fields"][number],
) {
  const answer = formatAnswerText(field, value, language).trim().replace(/\s+/g, " ");
  return answer && answer.toLowerCase() !== "no answer" ? answer : "";
}

function getReadableSummaryEntries(
  record: SignalRecord,
  t: ReturnType<typeof useI18n>["t"],
  language: Language,
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>,
  versionedFormsByFormId?: Record<string, VersionedFormSchemas>,
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

  const formForSubmission =
    versionedFormsByFormId?.[record.form.id]?.[getSubmissionVersion(record.submission)] ??
    (record.form as FormSchema);
  const entries = formForSubmission.fields
    .map((field) => ({
      question: field.label.trim() || field.id,
      answer: normalizeReadableAnswer(answers[field.id], language, field),
    }))
    .filter((entry) => entry.answer);

  if (entries.length > 0) {
    return entries;
  }

  const preview = normalizeReadableAnswer(getSignalPreview(record.submission), language);
  return preview ? [{ question: t("workspaceSignalFallbackQuestion"), answer: preview }] : [];
}

function buildSignalSummary(
  records: SignalRecord[],
  t: ReturnType<typeof useI18n>["t"],
  language: Language,
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>,
  versionedFormsByFormId?: Record<string, VersionedFormSchemas>,
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
    const entries = getReadableSummaryEntries(record, t, language, unlockedSignalsById, versionedFormsByFormId);
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
      trend: "steady",
    },
  ];
}

function buildActivityPoints(records: SignalRecord[], language: Language) {
  const dayFormatter = new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", { weekday: "short" });
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
  return buckets.map((bucket, index) => {
    const previous = buckets[index - 1]?.count ?? 0;
    const anomaly = bucket.count > 0 && bucket.count >= Math.max(2, average * 1.8);
    const delta = bucket.count - previous;
    let state: "stable" | "elevated" | "cooling" | "spike" = "stable";
    if (anomaly) {
      state = "spike";
    } else if (delta >= 2 || (bucket.count > previous && bucket.count >= Math.max(1, average))) {
      state = "elevated";
    } else if (delta < 0 && previous > 0) {
      state = "cooling";
    }

    return {
      ...bucket,
      intensity: bucket.count > 0 ? Math.max(12, Math.round((bucket.count / maxCount) * 100)) : 0,
      anomaly,
      state,
      reason:
        state === "spike"
          ? "spike"
          : state === "elevated"
            ? "elevated"
            : state === "cooling"
              ? "cooling"
              : "stable",
    };
  });
}

function getActivityStatus(points: ReturnType<typeof buildActivityPoints>): ActivityStatus {
  const counts = points.map((point) => point.count);
  const latest = counts[counts.length - 1] ?? 0;
  const previous = counts[counts.length - 2] ?? 0;
  const average = counts.reduce((sum, count) => sum + count, 0) / Math.max(counts.length, 1);
  const anomalyCount = points.filter((point) => point.anomaly).length;

  if (anomalyCount > 0 || latest >= Math.max(3, average * 1.8)) {
    return {
      label: "Spike detected",
      labelJa: "急増検知",
      detail: "Pulse intensity moved above the rolling baseline.",
      tone: "spike",
    };
  }
  if (latest > previous && latest >= Math.max(1, average)) {
    return {
      label: "Activity up",
      labelJa: "活動上向き",
      detail: "Recent intake is rising without crossing anomaly range.",
      tone: "up",
    };
  }
  if (latest < previous && previous > 0) {
    return {
      label: "Activity drop",
      labelJa: "活動低下",
      detail: "Pulse flow softened compared with the prior day.",
      tone: "drop",
    };
  }
  return {
    label: "Pulse nominal",
    labelJa: "波形安定",
    detail: "The last 7-day flow remains inside the expected operating band.",
    tone: "stable",
  };
}

function getClusterMapNodes(clusters: SignalCluster[]) {
  const fallback = [
    { key: "monitor-a", left: "18%", top: "34%", scale: 0.72, connected: true },
    { key: "monitor-b", left: "46%", top: "52%", scale: 0.58, connected: true },
    { key: "monitor-c", left: "72%", top: "28%", scale: 0.46, connected: false },
  ];

  if (clusters.length === 0) {
    return fallback;
  }

  return clusters.slice(0, 4).map((cluster, index) => ({
    key: cluster.label,
    left: ["18%", "46%", "74%", "62%"][index] ?? "50%",
    top: ["34%", "56%", "28%", "72%"][index] ?? "50%",
    scale: Math.max(0.5, Math.min(1.15, cluster.signalCount / 4 + 0.45)),
    connected: index > 0,
  }));
}

function getRecordReviewTitle(
  record: SignalRecord,
  t: ReturnType<typeof useI18n>["t"],
  language: Language,
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>,
) {
  const readableEntry = getReadableSummaryEntries(record, t, language, unlockedSignalsById)[0];
  return readableEntry?.answer || record.submission.subjectPreview || getSignalPreview(record.submission);
}

function getLatestTimestamp(record: SignalRecord) {
  const updatedAt = Date.parse(record.submission.updatedAt ?? record.submission.createdAt);
  const createdAt = Date.parse(record.submission.createdAt);
  if (!Number.isNaN(updatedAt) && updatedAt > 0) {
    return updatedAt;
  }
  return createdAt;
}

function getClusterGroupLabel(records: SignalRecord[]) {
  const representative = [...records].sort(
    (left, right) => getLatestTimestamp(right) - getLatestTimestamp(left),
  )[0];
  if (!representative) {
    return "Signal cluster";
  }

  const preview = representative.submission.subjectPreview?.trim() || getSignalPreview(representative.submission);
  return shortenSummaryText(preview || `${representative.form.title} ${representative.category}`, 42);
}

function formatAgeLabel(timestamp: number, now: number) {
  const hours = Math.max(1, Math.round((now - timestamp) / (1000 * 60 * 60)));
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function buildSilenceCandidates(records: SignalRecord[]) {
  const now = Date.now();
  const groups = new Map<string, SignalRecord[]>();

  records.forEach((record) => {
    const key = record.submission.clusterId?.trim() || `${record.form.id}:${record.category}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });

  return [...groups.entries()]
    .map(([key, groupedRecords]) => {
      const lastSeenAt = Math.max(...groupedRecords.map(getLatestTimestamp));
      const recentCount = groupedRecords.filter((record) => now - Date.parse(record.submission.createdAt) <= 3 * 24 * 60 * 60 * 1000).length;
      const trailingWeekCount = groupedRecords.filter((record) => {
        const age = now - Date.parse(record.submission.createdAt);
        return age > 3 * 24 * 60 * 60 * 1000 && age <= 10 * 24 * 60 * 60 * 1000;
      }).length;
      const unresolvedCount = groupedRecords.filter(
        (record) =>
          record.submission.status !== "archived" &&
          record.submission.triageStatus !== "fixed" &&
          record.submission.triageStatus !== "closed",
      ).length;
      const ageHours = Math.max(0, (now - lastSeenAt) / (1000 * 60 * 60));

      if (unresolvedCount < 2 && groupedRecords.length < 3) {
        return null;
      }

      if (unresolvedCount >= 2 && recentCount === 0 && trailingWeekCount > 0) {
        return {
          key,
          label: getClusterGroupLabel(groupedRecords),
          tone: "estimated_silence" as const,
          detail: "estimated_silence",
          unresolvedCount,
          recentCount,
          lastSeenLabel: formatAgeLabel(lastSeenAt, now),
        } satisfies SilenceCandidate;
      }

      if (unresolvedCount >= 3 && recentCount <= 1 && trailingWeekCount >= 2) {
        return {
          key,
          label: getClusterGroupLabel(groupedRecords),
          tone: "low_activity" as const,
          detail: "low_activity",
          unresolvedCount,
          recentCount,
          lastSeenLabel: formatAgeLabel(lastSeenAt, now),
        } satisfies SilenceCandidate;
      }

      if (unresolvedCount > 0 && ageHours >= 120) {
        return {
          key,
          label: getClusterGroupLabel(groupedRecords),
          tone: "inactive" as const,
          detail: "inactive",
          unresolvedCount,
          recentCount,
          lastSeenLabel: formatAgeLabel(lastSeenAt, now),
        } satisfies SilenceCandidate;
      }

      return null;
    })
    .filter((candidate): candidate is SilenceCandidate => Boolean(candidate))
    .sort((left, right) => {
      const toneRank = { estimated_silence: 0, low_activity: 1, inactive: 2 };
      const toneDelta = toneRank[left.tone] - toneRank[right.tone];
      if (toneDelta !== 0) {
        return toneDelta;
      }
      return right.unresolvedCount - left.unresolvedCount;
    })
    .slice(0, 4);
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function buildVelocitySnapshot(records: SignalRecord[], startMs: number, endMs: number): VelocitySnapshot {
  const lagHours = records
    .map((record) => {
      const createdAt = Date.parse(record.submission.createdAt);
      const updatedAt = Date.parse(record.submission.updatedAt ?? record.submission.createdAt);
      const reviewed =
        (record.submission.status !== "unread" || record.submission.triageStatus !== "new") &&
        !Number.isNaN(createdAt) &&
        !Number.isNaN(updatedAt) &&
        updatedAt > createdAt &&
        updatedAt >= startMs &&
        updatedAt < endMs;

      if (!reviewed) {
        return null;
      }

      return Math.max(0, (updatedAt - createdAt) / (1000 * 60 * 60));
    })
    .filter((value): value is number => value !== null);

  const bucketCounts = [
    { label: "0-6h", count: lagHours.filter((value) => value < 6).length },
    { label: "6-24h", count: lagHours.filter((value) => value >= 6 && value < 24).length },
    { label: "1-3d", count: lagHours.filter((value) => value >= 24 && value < 72).length },
    { label: "3d+", count: lagHours.filter((value) => value >= 72).length },
  ];

  return {
    count: lagHours.length,
    medianLagHours: median(lagHours),
    withinDayPercent: lagHours.length > 0 ? Math.round((lagHours.filter((value) => value <= 24).length / lagHours.length) * 100) : 0,
    bucketCounts,
  };
}

function getVelocityDirection(current: VelocitySnapshot, previous: VelocitySnapshot) {
  if (current.count === 0 || previous.count === 0 || current.medianLagHours === null || previous.medianLagHours === null) {
    return {
      label: "Stable readout",
      labelJa: "安定推移",
      detail: "Not enough historical review movement yet.",
      tone: "steady",
    } as const;
  }

  if (current.medianLagHours <= previous.medianLagHours * 0.8) {
    return {
      label: "Accelerating",
      labelJa: "反応加速",
      detail: "Review reactions are landing faster than the previous window.",
      tone: "accelerating",
    } as const;
  }

  if (current.medianLagHours >= previous.medianLagHours * 1.2) {
    return {
      label: "Slowing",
      labelJa: "反応低下",
      detail: "Median review lag has widened versus the previous window.",
      tone: "slowing",
    } as const;
  }

  return {
    label: "Stable readout",
    labelJa: "反応安定",
    detail: "Review velocity is holding near the previous window.",
    tone: "steady",
  } as const;
}

function getActivityMonitorState(
  activityStatus: ActivityStatus,
  anomalyCount: number,
): MonitorState {
  if (activityStatus.tone === "spike" || anomalyCount >= 2) {
    return { tone: "critical", key: "Critical" };
  }
  if (activityStatus.tone === "up") {
    return { tone: "elevated", key: "Elevated" };
  }
  if (activityStatus.tone === "drop") {
    return { tone: "recovering", key: "Recovering" };
  }
  return { tone: "stable", key: "Stable" };
}

function getVelocityMonitorState(
  current: VelocitySnapshot,
  previous: VelocitySnapshot,
  direction: ReturnType<typeof getVelocityDirection>,
): MonitorState {
  if (direction.tone === "slowing") {
    return {
      tone:
        current.medianLagHours !== null &&
        previous.medianLagHours !== null &&
        current.medianLagHours >= previous.medianLagHours * 1.5
          ? "critical"
          : "elevated",
      key:
        current.medianLagHours !== null &&
        previous.medianLagHours !== null &&
        current.medianLagHours >= previous.medianLagHours * 1.5
          ? "Critical"
          : "Elevated",
    };
  }
  if (direction.tone === "accelerating") {
    return { tone: "recovering", key: "Recovering" };
  }
  return { tone: "stable", key: "Stable" };
}

function getClusterMonitorState(
  clusters: SignalCluster[],
  anomalyCount: number,
  silenceCandidates: SilenceCandidate[],
): MonitorState {
  const primary = clusters[0];
  if (primary?.severity === "high" && (anomalyCount > 0 || primary.signalCount >= 4)) {
    return { tone: "critical", key: "Critical" };
  }
  if (primary && (primary.trend === "increasing" || silenceCandidates.length > 0)) {
    return { tone: "elevated", key: "Elevated" };
  }
  if (clusters.length > 1) {
    return { tone: "recovering", key: "Recovering" };
  }
  return { tone: "stable", key: "Stable" };
}

function buildSituationFlow(
  activity: MonitorState,
  anomalyCount: number,
  silence: MonitorState,
  velocity: MonitorState,
): SituationFlowStep[] {
  return [
    {
      key: "activity",
      tone: activity.tone,
      titleKey:
        activity.key === "Critical"
          ? "workspaceSituationPulseElevated"
          : activity.key === "Elevated"
            ? "workspaceSituationFlowRise"
            : activity.key === "Recovering"
              ? "workspaceSituationFlowCooling"
              : "workspaceSituationFlowNominal",
      bodyKey:
        activity.key === "Critical"
          ? "workspaceSituationPulseElevatedBody"
          : activity.key === "Elevated"
            ? "workspaceSituationFlowRiseBody"
            : activity.key === "Recovering"
              ? "workspaceSituationFlowCoolingBody"
              : "workspaceSituationFlowNominalBody",
    },
    {
      key: "anomaly",
      tone: anomalyCount > 0 ? "critical" : "stable",
      titleKey: anomalyCount > 0 ? "workspaceSituationSpikeDetected" : "workspaceSituationBaselineHolding",
      bodyKey: anomalyCount > 0 ? "workspaceSituationSpikeDetectedBody" : "workspaceSituationBaselineHoldingBody",
    },
    {
      key: "velocity",
      tone: velocity.tone,
      titleKey:
        velocity.key === "Critical"
          ? "workspaceSituationDelayIncreasing"
          : velocity.key === "Elevated"
            ? "workspaceSituationVelocitySlowing"
            : velocity.key === "Recovering"
              ? "workspaceSituationVelocityRecovering"
              : "workspaceSituationVelocityStable",
      bodyKey:
        velocity.key === "Critical"
          ? "workspaceSituationDelayIncreasingBody"
          : velocity.key === "Elevated"
            ? "workspaceSituationVelocitySlowingBody"
            : velocity.key === "Recovering"
              ? "workspaceSituationVelocityRecoveringBody"
              : "workspaceSituationVelocityStableBody",
    },
    {
      key: "silence",
      tone: silence.tone,
      titleKey:
        silence.key === "Critical"
          ? "workspaceSituationQuietZoneExpanding"
          : silence.key === "Elevated"
            ? "workspaceSituationQuietZoneWatching"
            : silence.key === "Recovering"
              ? "workspaceSituationQuietZoneRecovering"
              : "workspaceSituationQuietZoneNominal",
      bodyKey:
        silence.key === "Critical"
          ? "workspaceSituationQuietZoneExpandingBody"
          : silence.key === "Elevated"
            ? "workspaceSituationQuietZoneWatchingBody"
            : silence.key === "Recovering"
              ? "workspaceSituationQuietZoneRecoveringBody"
              : "workspaceSituationQuietZoneNominalBody",
    },
  ];
}

function exportInsightsSnapshotJson(input: {
  language: Language;
  profile: {
    id: string;
    signalType: string;
    analystType: string;
    analysisType: string;
    label: string;
    description: string;
    keyFinding: string;
    whyItMatters: string;
    highlightedAction: string;
    evidenceCount: number;
    emphasis: {
      tone: string;
      label: string;
      headline: string;
      body: string;
    };
    metrics: Array<{
      id: string;
      label: string;
      value: string;
      detail: string;
      tone?: string;
    }>;
    insightCards: Array<{
      id: string;
      eyebrow: string;
      title: string;
      body: string;
      tone?: string;
    }>;
    recommendedActions: Array<{
      id: string;
      title: string;
      detail: string;
      urgency: string;
    }>;
  };
  profileDistribution: Array<{
    id: string;
    label: string;
    score: number;
    signalCount: number;
  }>;
  totalSignals: number;
  unreadSignals: number;
  needsReviewSignals: number;
  encryptedSignals: number;
  unresolvedSignals: number;
  archivedSignals: number;
  anomalyCount: number;
  activityStatus: ActivityStatus;
  activityMonitorState: MonitorState;
  activityPoints: ReturnType<typeof buildActivityPoints>;
  silenceCandidates: SilenceCandidate[];
  silenceMonitorState: MonitorState;
  velocityDirection: ReturnType<typeof getVelocityDirection>;
  velocityMonitorState: MonitorState;
  currentVelocity: VelocitySnapshot;
  previousVelocity: VelocitySnapshot;
  clusters: SignalCluster[];
  clusterMonitorState: MonitorState;
  clusterMapNodes: InsightExportClusterNode[];
  relatedPatterns: RelatedPatternSummary[];
  situationFlow: SituationFlowStep[];
}) {
  const exportedAt = new Date().toISOString();
  const snapshot = {
    exportedAt,
    language: input.language,
    signalType: input.profile.signalType,
    analystType: input.profile.analystType,
    analysisType: input.profile.analysisType,
    analysisProfile: input.profile,
    profileDistribution: input.profileDistribution,
    summary: {
      totalSignals: input.totalSignals,
      unreadSignals: input.unreadSignals,
      needsReviewSignals: input.needsReviewSignals,
      unresolvedSignals: input.unresolvedSignals,
      archivedSignals: input.archivedSignals,
      encryptedSignals: input.encryptedSignals,
      anomalyCount: input.anomalyCount,
    },
    state: {
      activity: {
        status: input.activityStatus.tone,
        monitorState: input.activityMonitorState.tone,
      },
      silence: {
        monitorState: input.silenceMonitorState.tone,
        candidateCount: input.silenceCandidates.length,
      },
      velocity: {
        direction: input.velocityDirection.tone,
        monitorState: input.velocityMonitorState.tone,
      },
      cluster: {
        monitorState: input.clusterMonitorState.tone,
        clusterCount: input.clusters.length,
      },
    },
    situationFlow: input.situationFlow.map((step) => ({
      key: step.key,
      tone: step.tone,
    })),
    activityWave: input.activityPoints.map((point) => ({
      day: point.label,
      count: point.count,
      anomaly: point.anomaly,
      state: point.state,
      intensity: point.intensity,
    })),
    silenceDetection: input.silenceCandidates,
    responseVelocity: {
      direction: input.velocityDirection.tone,
      current: input.currentVelocity,
      previous: input.previousVelocity,
    },
    clusterAnalysis: {
      clusters: input.clusters,
      mapNodes: input.clusterMapNodes,
    },
    relatedSignalPatterns: input.relatedPatterns,
  };

  const stamp = exportedAt.replace(/[:.]/g, "-");
  downloadTextFile(
    `deepsignal-insights-snapshot-${stamp}.json`,
    JSON.stringify(snapshot, null, 2),
    "application/json",
  );
}

function getRelatedPatternLabel(reason: RelatedSignalReason) {
  switch (reason) {
    case "same_channel":
      return "same_channel";
    case "same_category":
      return "same_category";
    case "same_priority":
      return "same_priority";
    case "same_triage":
      return "same_triage";
    case "same_sender_type":
      return "same_sender_type";
    case "shared_tags":
      return "shared_tags";
    case "similar_subject":
      return "similar_subject";
    case "similar_preview":
      return "similar_preview";
    default:
      return "related_pattern";
  }
}

function buildRelatedPatternSummary(records: SignalRecord[]) {
  const sample = [...records]
    .filter(
      (record) =>
        record.submission.status === "unread" ||
        (record.submission.status !== "archived" &&
          record.submission.triageStatus !== "fixed" &&
          record.submission.triageStatus !== "closed"),
    )
    .sort((left, right) => Date.parse(right.submission.createdAt) - Date.parse(left.submission.createdAt))
    .slice(0, 8);

  const counts = new Map<string, number>();

  sample.forEach((record) => {
    getRelatedSignals({ selectedRecord: record, records, maxResults: 4 }).forEach((match) => {
      match.reasons.forEach((reason) => {
        const label = getRelatedPatternLabel(reason);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      });
      if (match.duplicateLikely) {
        counts.set("possible_duplicates", (counts.get("possible_duplicates") ?? 0) + 1);
      }
    });
  });

  return [...counts.entries()]
    .map(([label, count]) => ({
      key: label,
      label,
      count,
    } satisfies RelatedPatternSummary))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5);
}

function getActionUrgencyLabel(urgency: "now" | "next" | "watch") {
  switch (urgency) {
    case "now":
      return "Now";
    case "next":
      return "Next";
    default:
      return "Watch";
  }
}

interface WorkspaceInsightsProps {
  totalSignals: number;
  unreadSignals: number;
  needsReviewSignals: number;
  encryptedSignals: number;
  records: SignalRecord[];
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>;
  versionedFormsByFormId?: Record<string, VersionedFormSchemas>;
}

export function WorkspaceInsights({
  totalSignals,
  unreadSignals,
  needsReviewSignals,
  encryptedSignals,
  records,
  unlockedSignalsById,
  versionedFormsByFormId,
}: WorkspaceInsightsProps) {
  const { t, language } = useI18n();
  const signalSummary = useMemo(
    () => buildSignalSummary(records, t, language, unlockedSignalsById, versionedFormsByFormId),
    [records, t, language, unlockedSignalsById, versionedFormsByFormId],
  );
  const clusters = useMemo(
    () => buildSignalClusters(records, signalSummary.items, t),
    [records, signalSummary.items, t],
  );
  const primaryCluster = clusters[0];
  const activityPoints = useMemo(() => buildActivityPoints(records, language), [records, language]);
  const anomalyPoints = useMemo(() => activityPoints.filter((point) => point.anomaly), [activityPoints]);
  const anomalyCount = anomalyPoints.length;
  const activityStatus = useMemo(() => getActivityStatus(activityPoints), [activityPoints]);
  const attentionRecords = useMemo(
    () =>
      records
        .filter((record) => record.submission.status === "unread" || record.submission.triageStatus === "new")
        .slice(0, 3),
    [records],
  );
  const unresolvedSignals = useMemo(
    () =>
      records.filter(
        (record) =>
          record.submission.status !== "archived" &&
          record.submission.triageStatus !== "fixed" &&
          record.submission.triageStatus !== "closed",
      ).length,
    [records],
  );
  const archivedSignals = useMemo(
    () => records.filter((record) => record.submission.status === "archived").length,
    [records],
  );
  const silenceCandidates = useMemo(() => buildSilenceCandidates(records), [records]);
  const velocityWindow = useMemo(() => {
    const now = Date.now();
    const currentVelocity = buildVelocitySnapshot(records, now - 7 * 24 * 60 * 60 * 1000, now);
    const previousVelocity = buildVelocitySnapshot(records, now - 14 * 24 * 60 * 60 * 1000, now - 7 * 24 * 60 * 60 * 1000);
    return {
      currentVelocity,
      previousVelocity,
      velocityDirection: getVelocityDirection(currentVelocity, previousVelocity),
    };
  }, [records]);
  const { currentVelocity, previousVelocity, velocityDirection } = velocityWindow;
  const activityMonitorState = getActivityMonitorState(activityStatus, anomalyCount);
  const silenceMonitorState: MonitorState = useMemo(
    () =>
      silenceCandidates.length > 0
        ? silenceCandidates[0].tone === "estimated_silence"
          ? { tone: "critical", key: "Critical" }
          : silenceCandidates[0].tone === "low_activity"
            ? { tone: "elevated", key: "Elevated" }
            : { tone: "recovering", key: "Recovering" }
        : { tone: "stable", key: "Stable" },
    [silenceCandidates],
  );
  const velocityMonitorState = getVelocityMonitorState(currentVelocity, previousVelocity, velocityDirection);
  const clusterMonitorState = getClusterMonitorState(clusters, anomalyCount, silenceCandidates);
  const situationFlow = useMemo(
    () => buildSituationFlow(activityMonitorState, anomalyCount, silenceMonitorState, velocityMonitorState),
    [activityMonitorState, anomalyCount, silenceMonitorState, velocityMonitorState],
  );
  const relatedPatterns = useMemo(() => buildRelatedPatternSummary(records), [records]);
  const analysisProfile = useMemo(
    () =>
      resolveAnalysisProfile({
        records,
        totalSignals,
        unreadSignals,
        needsReviewSignals,
        encryptedSignals,
        unresolvedSignals,
        archivedSignals,
        anomalyCount,
        activityStatusTone: activityStatus.tone,
        signalSummaryItems: signalSummary.items,
        encryptedWaitingCount: signalSummary.encryptedWaitingCount,
        clusters,
        silenceCandidates: silenceCandidates.map((candidate) => ({
          key: candidate.key,
          label: candidate.label,
          tone: candidate.tone,
          unresolvedCount: candidate.unresolvedCount,
          recentCount: candidate.recentCount,
          lastSeenLabel: candidate.lastSeenLabel,
        })),
        relatedPatterns,
        currentVelocity,
      }),
    [
      records,
      totalSignals,
      unreadSignals,
      needsReviewSignals,
      encryptedSignals,
      unresolvedSignals,
      archivedSignals,
      anomalyCount,
      activityStatus.tone,
      signalSummary.items,
      signalSummary.encryptedWaitingCount,
      clusters,
      silenceCandidates,
      relatedPatterns,
      currentVelocity,
    ],
  );
  const profileDistribution = useMemo(
    () =>
      resolveProfileDistribution(records)
        .slice(0, 4)
        .map((entry) => ({
          ...entry,
          label: getAnalysisProfileLabel(entry.id),
          signalCount: records.filter((record) => getSignalProfileId(record) === entry.id).length,
        }))
        .filter((entry) => entry.signalCount > 0),
    [records],
  );
  const clusterMapNodes = useMemo(() => getClusterMapNodes(clusters), [clusters]);
  const analysisExperience = useMemo(
    () =>
      buildWorkspaceAnalysisExperience({
        records,
        profile: analysisProfile,
        encryptedWaitingCount: signalSummary.encryptedWaitingCount,
        anomalyCount,
        topClusterLabel: primaryCluster?.label ?? "No dominant cluster yet",
      }),
    [records, analysisProfile, signalSummary.encryptedWaitingCount, anomalyCount, primaryCluster?.label],
  );
  const activityWaveCard = (
    <article className="workspace-sonar-card">
      <div className="workspace-signal-summary-header">
        <div>
          <p className="eyebrow">{t("workspaceActivityWaveEyebrow")}</p>
          <h3>{t("workspaceActivityWaveTitle")}</h3>
        </div>
        <div className="workspace-wave-status">
          <span className={`workspace-monitor-state is-${activityMonitorState.tone}`}>
            {t(`workspaceMonitorState${activityMonitorState.key}`)}
          </span>
          <span className={`signal-chip signal-chip-soft wave-chip is-${activityStatus.tone}`}>
            {t(`workspaceActivityStatus${activityStatus.tone === "up" ? "Up" : activityStatus.tone === "drop" ? "Drop" : activityStatus.tone === "spike" ? "Spike" : "Stable"}`)}
          </span>
          <span className="workspace-wave-status-ja">{t(`workspaceActivityStatus${activityStatus.tone === "up" ? "UpJa" : activityStatus.tone === "drop" ? "DropJa" : activityStatus.tone === "spike" ? "SpikeJa" : "StableJa"}`)}</span>
        </div>
      </div>
      <div className="workspace-sonar-wave" aria-label={t("workspaceSignalActivityTitle")}>
        {activityPoints.map((point) => (
          <span
            key={point.label}
            className={[point.count === 0 ? "is-empty" : undefined, point.anomaly ? "is-anomaly" : undefined]
              .filter(Boolean)
              .join(" ")}
            style={{ "--density": `${point.intensity}%` } as CSSProperties}
            title={`${point.label}: ${point.count}`}
          >
            <i />
            <small>{point.label}</small>
            <em>{t(`workspaceActivityPoint${point.state === "elevated" ? "Elevated" : point.state === "cooling" ? "Cooling" : point.state === "spike" ? "Spike" : "Stable"}`)}</em>
            <b>{t(`workspaceActivityPoint${point.reason === "elevated" ? "ElevatedBody" : point.reason === "cooling" ? "CoolingBody" : point.reason === "spike" ? "SpikeBody" : "StableBody"}`)}</b>
          </span>
        ))}
      </div>
      <div className="workspace-wave-footer">
        <p className="workspace-signal-summary-empty">
          {t(`workspaceActivityStatus${activityStatus.tone === "up" ? "UpBody" : activityStatus.tone === "drop" ? "DropBody" : activityStatus.tone === "spike" ? "SpikeBody" : "StableBody"}`)}
        </p>
        <span className="signal-chip signal-chip-soft">{t("workspaceAnomalyCount", { count: anomalyCount })}</span>
      </div>
    </article>
  );

  return (
    <section
      className={`panel workspace-insights-panel analysis-tone-${analysisProfile.emphasis.tone}`}
      aria-labelledby="workspace-insights-title"
    >
      <div className="workspace-insights-header">
        <div>
          <p className="eyebrow">{t("workspaceInsightsEyebrow")}</p>
          <h2 id="workspace-insights-title">{t("workspaceInsightsTitle")}</h2>
          <p className="workspace-insights-intro">{t("workspaceInsightsIntro")}</p>
        </div>
        <div className="workspace-insights-header-actions">
          <span className="signal-chip signal-chip-soft">{t("workspaceSignalConsole")}</span>
          <button
            type="button"
            className="ghost-button workspace-insights-export-button"
            onClick={() =>
              exportInsightsSnapshotJson({
                language,
                profile: {
                  id: analysisProfile.id,
                  signalType: analysisProfile.signalType,
                  analystType: analysisProfile.analystType,
                  analysisType: analysisProfile.analysisType,
                  label: analysisProfile.label,
                  description: analysisProfile.description,
                  keyFinding: analysisProfile.keyFinding,
                  whyItMatters: analysisProfile.whyItMatters,
                  highlightedAction: analysisProfile.highlightedAction,
                  evidenceCount: analysisProfile.evidenceCount,
                  emphasis: analysisProfile.emphasis,
                  metrics: analysisProfile.metrics,
                  insightCards: analysisProfile.insightCards,
                  recommendedActions: analysisProfile.recommendedActions,
                },
                profileDistribution,
                totalSignals,
                unreadSignals,
                needsReviewSignals,
                encryptedSignals,
                unresolvedSignals,
                archivedSignals,
                anomalyCount,
                activityStatus,
                activityMonitorState,
                activityPoints,
                silenceCandidates,
                silenceMonitorState,
                velocityDirection,
                velocityMonitorState,
                currentVelocity,
                previousVelocity,
                clusters,
                clusterMonitorState,
                clusterMapNodes,
                relatedPatterns,
                situationFlow,
              })
            }
          >
            {t("workspaceExportSnapshotJson")}
          </button>
        </div>
      </div>

      {activityWaveCard}

      <article className="workspace-signal-summary-card workspace-insights-section">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">Analysis Profile</p>
            <h3>{analysisProfile.label}</h3>
            <p className="workspace-insights-intro">{analysisProfile.description}</p>
          </div>
          <span className="workspace-profile-pill">{analysisProfile.emphasis.label}</span>
        </div>
        <div className="workspace-analysis-badge-row" aria-label="Active insight lens">
          <span className="signal-chip signal-chip-soft is-active">
            Signal Type: {getAnalysisSignalTypeLabel(analysisProfile.signalType)}
          </span>
          <span className="signal-chip signal-chip-soft">
            Analyst Type: {getAnalystTypeLabel(analysisProfile.analystType)}
          </span>
          <span className="signal-chip signal-chip-soft">
            Analysis Type: {getAnalysisTypeLabel(analysisProfile.analysisType)}
          </span>
          <span className="signal-chip signal-chip-soft">
            Evidence: {analysisProfile.evidenceCount}
          </span>
        </div>
        {profileDistribution.length > 0 ? (
          <div className="workspace-profile-chip-row" aria-label="Active signal type distribution">
            {profileDistribution.map((profile) => (
              <span
                key={profile.id}
                className={`signal-chip signal-chip-soft ${profile.id === analysisProfile.id ? "is-active" : ""}`}
                title={`${profile.label}: ${profile.signalCount} signals`}
              >
                {getAnalysisProfileShortLabel(profile.id)} {profile.signalCount}
              </span>
            ))}
          </div>
        ) : null}
        <article className="workspace-analysis-summary-card">
          <div className="workspace-analysis-summary-grid">
            {analysisExperience.summaryEntries.map((entry) => (
              <div key={entry.id}>
                <span>{entry.label}</span>
                <strong>{entry.value}</strong>
                {entry.detail ? <p>{entry.detail}</p> : null}
              </div>
            ))}
          </div>
        </article>
        <div className="workspace-insights-grid">
          {analysisExperience.overviewCards.map((card) => (
            <article key={card.id} className={`workspace-insight-card is-${card.tone ?? "cluster"}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
            </article>
          ))}
        </div>
        <div className="workspace-insights-grid">
          {analysisProfile.metrics.map((metric) => (
            <article key={metric.id} className={`workspace-insight-card is-${metric.tone ?? "cluster"}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </div>
        <div className="workspace-situation-flow" aria-label={t("workspaceSituationFlowTitle")}>
          <div className="workspace-situation-flow-header">
            <div>
              <p className="eyebrow">{t("workspaceSituationFlowEyebrow")}</p>
              <h3>{t("workspaceSituationFlowTitle")}</h3>
            </div>
            <span className="signal-chip signal-chip-soft">{t("workspaceSituationFlowMonitoring")}</span>
          </div>
          <div className="workspace-situation-flow-grid">
            {situationFlow.map((step, index) => (
              <article key={step.key} className={`workspace-situation-step is-${step.tone}`}>
                <span className="workspace-situation-index">{index + 1}</span>
                <strong>{t(step.titleKey)}</strong>
                <p>{t(step.bodyKey)}</p>
              </article>
            ))}
          </div>
        </div>
        <article className="workspace-signal-intelligence-card">
          <div className="workspace-signal-intelligence-copy">
            <p className="eyebrow">Visual emphasis</p>
            <h3>{analysisProfile.emphasis.headline}</h3>
            <p>{analysisProfile.emphasis.body}</p>
            {analysisProfile.analystType === "executive" ? (
              <div className="workspace-executive-lines">
                {analysisExperience.executiveLines.map((line) => (
                  <small key={line}>{line}</small>
                ))}
              </div>
            ) : null}
          </div>
          <div className="workspace-signal-readout">
            <span>Active profile</span>
            <strong>{analysisProfile.shortLabel}</strong>
            <small>
              {profileDistribution.length > 1
                ? `${profileDistribution.length} profile types detected in this view.`
                : "One profile type is dominating the current view."}
            </small>
          </div>
          <div className="workspace-intelligence-meta">
            <span>Type: {analysisProfile.label}</span>
            <span>Signal type: {getAnalysisSignalTypeLabel(analysisProfile.signalType)}</span>
            <span>Analyst type: {getAnalystTypeLabel(analysisProfile.analystType)}</span>
            <span>Analysis type: {getAnalysisTypeLabel(analysisProfile.analysisType)}</span>
            <span>Top cluster: {primaryCluster?.label ?? "No dominant cluster yet"}</span>
            <span>{t("workspaceEncryptedCoverage", { count: encryptedSignals, total: totalSignals })}</span>
            <span>{t("workspacePotentialAreaLabel")}: {primaryCluster?.keywords.slice(0, 2).join(" / ") || t("workspaceEncryptedIntakeArea")}</span>
            <span>{t("workspaceUnreadCountPill", { count: unreadSignals })}</span>
            <span>{t("workspaceUnresolvedCountPill", { count: unresolvedSignals })}</span>
            <span>{t("workspaceArchivedCountPill", { count: archivedSignals })}</span>
          </div>
        </article>
      </article>

      <div className="workspace-insights-section-grid">
        <article className="workspace-review-queue-card workspace-diagnostic-card">
          <div className="workspace-signal-summary-header">
            <div>
              <p className="eyebrow">Type-specific insights</p>
              <h3>Insight cards</h3>
            </div>
          </div>
          <div className="workspace-diagnostic-list workspace-profile-card-list">
            {analysisProfile.insightCards.map((card) => (
              <div key={card.id} className={`workspace-diagnostic-row is-${card.tone ?? "pattern"}`}>
                <strong>{card.title}</strong>
                <span>{card.eyebrow}</span>
                <small>{card.body}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="workspace-review-queue-card workspace-diagnostic-card">
          <div className="workspace-signal-summary-header">
            <div>
              <p className="eyebrow">Recommended actions</p>
              <h3>Next operator moves</h3>
            </div>
          </div>
          <div className="workspace-diagnostic-list workspace-profile-card-list">
            {analysisProfile.recommendedActions.map((action) => (
              <div key={action.id} className={`workspace-diagnostic-row is-${action.urgency === "now" ? "alert" : action.urgency === "next" ? "estimated_silence" : "pattern"}`}>
                <strong>{action.title}</strong>
                <span>{getActionUrgencyLabel(action.urgency)}</span>
                <small>{action.detail}</small>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="workspace-insights-section-grid">
        <article className="workspace-review-queue-card workspace-diagnostic-card">
          <div className="workspace-signal-summary-header">
            <div>
              <p className="eyebrow">{t("workspaceAnomalyDetectionEyebrow")}</p>
              <h3>{t("workspaceAnomalyDetectionTitle")}</h3>
            </div>
            <span className={`workspace-monitor-state is-${anomalyCount > 0 ? "critical" : "stable"}`}>
              {t(`workspaceMonitorState${anomalyCount > 0 ? "Critical" : "Stable"}`)}
            </span>
          </div>
          {anomalyPoints.length > 0 ? (
            <div className="workspace-diagnostic-list">
              {anomalyPoints.map((point) => (
                <div key={point.label} className="workspace-diagnostic-row is-alert">
                  <strong>{point.label}</strong>
                  <span>{t("workspaceClusterSignalCount", { count: point.count })}</span>
                  <small>{t("workspaceAnomalyDetectionItemBody")}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="workspace-monitor-empty">
              <strong>{t("workspaceSystemStableTitle")}</strong>
              <span>{t("workspaceMonitoringActiveLabel")}</span>
              <p>{t("workspaceAnomalyDetectionEmpty")}</p>
            </div>
          )}
        </article>

        <article className="workspace-review-queue-card workspace-diagnostic-card">
          <div className="workspace-signal-summary-header">
            <div>
              <p className="eyebrow">{t("workspaceSilenceDetectionEyebrow")}</p>
              <h3>{t("workspaceSilenceDetectionTitle")}</h3>
            </div>
            <div className="workspace-header-readout">
              <span className={`workspace-monitor-state is-${silenceMonitorState.tone}`}>
                {t(`workspaceMonitorState${silenceMonitorState.key}`)}
              </span>
              <span className="signal-chip signal-chip-soft">{t("workspaceQuietZonesMonitored")}</span>
            </div>
          </div>
          {silenceCandidates.length > 0 ? (
            <div className="workspace-diagnostic-list">
              {silenceCandidates.map((candidate) => (
                <div key={candidate.key} className={`workspace-diagnostic-row is-${candidate.tone}`}>
                  <strong>{candidate.label}</strong>
                  <span>{t("workspaceSilenceOpenCount", { count: candidate.unresolvedCount })}</span>
                  <small>
                    {t(`workspaceSilenceTone${candidate.detail === "estimated_silence" ? "Estimated" : candidate.detail === "low_activity" ? "LowActivity" : "Inactive"}`)}{" "}
                    {t("workspaceSilenceLastSeen", { age: candidate.lastSeenLabel, count: candidate.recentCount })}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <div className="workspace-monitor-empty">
              <strong>{t("workspaceSilenceDetectionEmptyTitle")}</strong>
              <span>{t("workspaceSilenceMonitoringActiveLabel")}</span>
              <p>{t("workspaceSilenceDetectionEmptyBody")}</p>
            </div>
          )}
        </article>
      </div>

      <article className="workspace-signal-summary-card">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">{t("workspaceClusterAnalysisEyebrow")}</p>
            <h3>{t("workspaceEmergingClustersTitle")}</h3>
          </div>
          <span className={`workspace-monitor-state is-${clusterMonitorState.tone}`}>
            {t(`workspaceMonitorState${clusterMonitorState.key}`)}
          </span>
        </div>
        <div className="workspace-cluster-map" aria-label="Cluster pulse map">
          <div className="workspace-cluster-map-grid" />
          {clusterMapNodes.map((node, index) => (
            <div
              key={node.key}
              className={`workspace-cluster-node ${index === 0 ? "is-primary" : ""}`}
              style={
                {
                  "--node-left": node.left,
                  "--node-top": node.top,
                  "--node-scale": node.scale,
                } as CSSProperties
              }
            >
              {node.connected ? <i className="workspace-cluster-link" aria-hidden="true" /> : null}
              <span />
              <small className="workspace-cluster-node-ring" aria-hidden="true" />
            </div>
          ))}
          <div className="workspace-cluster-map-caption">
            <strong>{clusters.length > 0 ? t("workspaceClusterPulseVisible") : t("workspaceClusterGridIdle")}</strong>
            <p>
              {clusters.length > 0
                ? t("workspaceClusterPulseVisibleBody")
                : t("workspaceClusterGridIdleBody")}
            </p>
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

      <div className="workspace-insights-section-grid">
        <article className="workspace-review-queue-card workspace-diagnostic-card">
          <div className="workspace-signal-summary-header">
            <div>
              <p className="eyebrow">{t("workspaceResponseVelocityEyebrow")}</p>
              <h3>{t("workspaceResponseVelocityTitle")}</h3>
            </div>
            <div className="workspace-header-readout">
              <span className={`workspace-monitor-state is-${velocityMonitorState.tone}`}>
                {t(`workspaceMonitorState${velocityMonitorState.key}`)}
              </span>
              <span className={`signal-chip signal-chip-soft velocity-chip is-${velocityDirection.tone}`}>
                {t(`workspaceVelocity${velocityDirection.tone === "accelerating" ? "Accelerating" : velocityDirection.tone === "slowing" ? "Slowing" : "Steady"}`)}
              </span>
            </div>
          </div>
          <div className="workspace-velocity-grid">
            <div className="workspace-velocity-metric">
              <span>{t("workspaceVelocityCurrentMedian")}</span>
              <strong>{currentVelocity.medianLagHours === null ? "N/A" : `${Math.round(currentVelocity.medianLagHours)}h`}</strong>
              <small>{t("workspaceVelocityCurrentMedianBody", { count: currentVelocity.count })}</small>
            </div>
            <div className="workspace-velocity-metric">
              <span>{t("workspaceVelocityPreviousMedian")}</span>
              <strong>{previousVelocity.medianLagHours === null ? "N/A" : `${Math.round(previousVelocity.medianLagHours)}h`}</strong>
              <small>{t("workspaceVelocityPreviousMedianBody", { count: previousVelocity.count })}</small>
            </div>
            <div className="workspace-velocity-metric">
              <span>{t("workspaceVelocityWithinDay")}</span>
              <strong>{currentVelocity.withinDayPercent}%</strong>
              <small>{t(`workspaceVelocity${velocityDirection.tone === "accelerating" ? "AcceleratingBody" : velocityDirection.tone === "slowing" ? "SlowingBody" : "SteadyBody"}`)}</small>
            </div>
          </div>
          <div className="workspace-velocity-buckets" aria-label="Response velocity buckets">
            {currentVelocity.bucketCounts.map((bucket) => (
              <div key={bucket.label} className="workspace-velocity-bucket">
                <strong>{bucket.count}</strong>
                <span>{bucket.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="workspace-review-queue-card workspace-diagnostic-card">
          <div className="workspace-signal-summary-header">
            <div>
              <p className="eyebrow">{t("workspaceRelatedPatternsEyebrow")}</p>
              <h3>{t("workspaceRelatedPatternsTitle")}</h3>
            </div>
          </div>
          {relatedPatterns.length > 0 ? (
            <div className="workspace-diagnostic-list">
              {relatedPatterns.map((pattern) => (
                <div key={pattern.key} className="workspace-diagnostic-row is-pattern">
                  <strong>{t(`workspaceRelatedPattern${pattern.label}`)}</strong>
                  <span>{pattern.count}</span>
                  <small>{t("workspaceRelatedPatternsItemBody")}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="workspace-monitor-empty">
              <strong>{t("workspaceRelatedPatternsEmptyTitle")}</strong>
              <span>{t("workspaceRelatedPatternsMonitoringLabel")}</span>
              <p>{t("workspaceRelatedPatternsEmptyBody")}</p>
            </div>
          )}
        </article>
      </div>

      <div className="workspace-intelligence-lower-grid">
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
                    <strong>{shortenSummaryText(getRecordReviewTitle(record, t, language, unlockedSignalsById), 76)}</strong>
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

export default WorkspaceInsights;
