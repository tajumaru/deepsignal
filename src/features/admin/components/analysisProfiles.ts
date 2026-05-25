import type { FormSchema } from "../../../types";
import type {
  AnalysisProfileId,
  AnalysisSignalType,
  AnalysisType,
  SignalSeverity,
} from "../../../types";
import type { SignalRecord } from "../hooks/useSignalInboxData";

export type AnalysisAccentTone = "teal" | "amber" | "crimson" | "violet" | "slate";

export interface AnalysisMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone?: "alert" | "cluster";
}

export interface AnalysisInsightCard {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  tone?: "alert" | "cluster";
}

export interface AnalysisRecommendedAction {
  id: string;
  title: string;
  detail: string;
  urgency: "now" | "next" | "watch";
}

export interface AnalysisVisualEmphasis {
  tone: AnalysisAccentTone;
  label: string;
  headline: string;
  body: string;
}

export interface ResolvedAnalysisProfile {
  id: AnalysisProfileId;
  signalType: AnalysisSignalType;
  analysisType: AnalysisType;
  label: string;
  shortLabel: string;
  description: string;
  keyFinding: string;
  whyItMatters: string;
  highlightedAction: string;
  evidenceCount: number;
  metrics: AnalysisMetric[];
  insightCards: AnalysisInsightCard[];
  recommendedActions: AnalysisRecommendedAction[];
  emphasis: AnalysisVisualEmphasis;
}

export interface AnalysisProfileContext {
  records: SignalRecord[];
  totalSignals: number;
  unreadSignals: number;
  needsReviewSignals: number;
  encryptedSignals: number;
  unresolvedSignals: number;
  archivedSignals: number;
  anomalyCount: number;
  activityStatusTone: "stable" | "up" | "drop" | "spike";
  signalSummaryItems: Array<{ question: string; answer: string; count: number; total: number }>;
  encryptedWaitingCount: number;
  clusters: Array<{
    label: string;
    summary: string;
    keywords: string[];
    signalCount: number;
    confidence: number;
    severity: SignalSeverity;
    trend: "increasing" | "steady";
  }>;
  silenceCandidates: Array<{
    key: string;
    label: string;
    tone: "estimated_silence" | "inactive" | "low_activity";
    unresolvedCount: number;
    recentCount: number;
    lastSeenLabel: string;
  }>;
  relatedPatterns: Array<{ key: string; label: string; count: number }>;
  currentVelocity: {
    count: number;
    medianLagHours: number | null;
    withinDayPercent: number;
    bucketCounts: Array<{ label: string; count: number }>;
  };
}

export interface AnalysisProfileDefinition {
  id: AnalysisProfileId;
  label: string;
  shortLabel: string;
  description: string;
  resolve(context: AnalysisProfileContext): ResolvedAnalysisProfile;
}

interface ProfileMatchResult {
  id: AnalysisProfileId;
  score: number;
}

const signalTypeLabels: Record<AnalysisSignalType, string> = {
  feedback: "Feedback",
  product_voice: "Product Voice",
  agent_log: "Agent Log",
  operation: "Operation",
  incident: "Incident",
  disaster: "Disaster",
  safety: "Safety",
  governance: "Governance",
  community: "Community",
  generic: "Generic",
};

const analysisTypeLabels: Record<AnalysisType, string> = {
  summary: "Summary",
  risk: "Risk",
  trend: "Trend",
  action: "Action",
  sentiment: "Sentiment",
  urgency: "Urgency",
  anomaly: "Anomaly",
  silence: "Silence",
  velocity: "Velocity",
};

const defaultSignalTypeByProfile: Record<AnalysisProfileId, AnalysisSignalType> = {
  customer_feedback: "feedback",
  ai_agent_log: "agent_log",
  incident_report: "incident",
  governance_signal: "governance",
  general_signal: "generic",
};

const defaultAnalysisTypeBySignalType: Record<AnalysisSignalType, AnalysisType> = {
  feedback: "sentiment",
  product_voice: "action",
  agent_log: "anomaly",
  operation: "velocity",
  incident: "urgency",
  disaster: "urgency",
  safety: "risk",
  governance: "risk",
  community: "trend",
  generic: "summary",
};

function clampPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function getCorpus(record: SignalRecord) {
  const parts = [
    record.form.analysisProfileId,
    record.form.title,
    record.form.description,
    record.form.purpose,
    record.category,
    record.submission.subjectPreview,
    record.submission.aiSummary,
    record.submission.emotion,
    record.submission.tags.join(" "),
    (record.submission.keywords ?? []).join(" "),
    Object.values(record.submission.answers ?? {})
      .map((value) => {
        if (Array.isArray(value)) {
          return value.join(" ");
        }
        if (value && typeof value === "object") {
          return Object.values(value as Record<string, unknown>).join(" ");
        }
        return String(value ?? "");
      })
      .join(" "),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function countMatches(records: SignalRecord[], matcher: RegExp) {
  return records.reduce((count, record) => count + (matcher.test(getCorpus(record)) ? 1 : 0), 0);
}

function ratio(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return (count / total) * 100;
}

function getFormAnalysisCorpus(form: Pick<FormSchema, "analysisProfileId" | "signalType" | "analysisType" | "purpose" | "title" | "description">) {
  return [
    form.analysisProfileId,
    form.signalType,
    form.analysisType,
    form.title,
    form.description,
    form.purpose,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortByPriority<T extends { id: string }>(items: T[], priorities: string[]) {
  if (priorities.length === 0) {
    return items;
  }
  const ranking = new Map(priorities.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const leftRank = ranking.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = ranking.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return 0;
  });
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function topClusterLabel(context: AnalysisProfileContext) {
  return context.clusters[0]?.label ?? "No dominant cluster yet";
}

function topClusterShare(context: AnalysisProfileContext) {
  const top = context.clusters[0];
  if (!top || context.totalSignals === 0) {
    return 0;
  }
  return ratio(top.signalCount, context.totalSignals);
}

function getSeverityMix(records: SignalRecord[]) {
  const high = records.filter((record) => record.submission.severity === "high" || record.submission.priority === "high").length;
  const medium = records.filter(
    (record) =>
      !(
        record.submission.severity === "high" ||
        record.submission.priority === "high"
      ) && (
        record.submission.severity === "medium" ||
        record.submission.priority === "medium"
      ),
  ).length;
  const low = Math.max(0, records.length - high - medium);
  return { high, medium, low };
}

function estimateSentiment(records: SignalRecord[]) {
  const positiveMatcher = /\b(love|great|good|thanks|smooth|helpful|happy|positive|calm|praise)\b/;
  const negativeMatcher = /\b(bad|broken|pain|friction|blocked|angry|frustrated|issue|problem|slow|concern|urgent)\b/;
  const positive = countMatches(records, positiveMatcher);
  const negative = countMatches(records, negativeMatcher);
  const neutral = Math.max(0, records.length - positive - negative);
  return { positive, negative, neutral };
}

function formatLag(hours: number | null) {
  return hours === null ? "N/A" : `${Math.round(hours)}h`;
}

function getUniqueForms(records: SignalRecord[]) {
  return new Set(records.map((record) => record.form.id)).size;
}

function buildDefaultProfile(context: AnalysisProfileContext): ResolvedAnalysisProfile {
  const topCluster = context.clusters[0];
  return {
    id: "general_signal",
    signalType: "generic",
    analysisType: "summary",
    label: "General Signal",
    shortLabel: "General",
    description: "Balanced review profile for mixed inboxes and uncategorized signal streams.",
    keyFinding: "Mixed signals are active across the inbox.",
    whyItMatters: "Queue health and repeated patterns are more important than any single domain lens in this view.",
    highlightedAction: "Start with the newest unread records in the dominant cluster.",
    evidenceCount: context.totalSignals,
    metrics: [
      {
        id: "open-load",
        label: "Open load",
        value: context.unresolvedSignals.toLocaleString(),
        detail: `${context.unreadSignals} unread / ${context.needsReviewSignals} active`,
        tone: context.unresolvedSignals > 3 ? "alert" : "cluster",
      },
      {
        id: "dominant-cluster",
        label: "Dominant cluster",
        value: clampPercent(topClusterShare(context)),
        detail: topCluster ? topCluster.label : "No dominant cluster yet",
        tone: "cluster",
      },
      {
        id: "review-lag",
        label: "Review lag",
        value: formatLag(context.currentVelocity.medianLagHours),
        detail: `${context.currentVelocity.withinDayPercent}% handled inside 24h`,
        tone: context.currentVelocity.medianLagHours !== null && context.currentVelocity.medianLagHours > 24 ? "alert" : "cluster",
      },
      {
        id: "proof-coverage",
        label: "Proof coverage",
        value: clampPercent(ratio(context.totalSignals - context.encryptedWaitingCount, Math.max(context.totalSignals, 1))),
        detail: `${context.encryptedSignals} encrypted / ${context.encryptedWaitingCount} still locked`,
        tone: "cluster",
      },
    ],
    insightCards: [
      {
        id: "cluster",
        eyebrow: "Primary cluster",
        title: topClusterLabel(context),
        body: topCluster
          ? `${topCluster.signalCount} signals align around ${topCluster.summary.toLowerCase()}.`
          : "No repeated cluster has separated itself from the background yet.",
      },
      {
        id: "anomaly",
        eyebrow: "Anomaly watch",
        title: `${context.anomalyCount} anomalies detected`,
        body: context.anomalyCount > 0
          ? "Recent intake moved outside the rolling baseline and needs fast triage."
          : "The recent signal pulse is staying inside the expected operating band.",
        tone: context.anomalyCount > 0 ? "alert" : "cluster",
      },
      {
        id: "silence",
        eyebrow: "Quiet zones",
        title: `${context.silenceCandidates.length} monitored segments`,
        body: context.silenceCandidates[0]
          ? `${context.silenceCandidates[0].label} has ${context.silenceCandidates[0].unresolvedCount} unresolved signals with low recent follow-up.`
          : "No silence pattern currently stands out over the trailing window.",
      },
    ],
    recommendedActions: [
      {
        id: "triage-top",
        title: "Clear the top unread cluster",
        detail: "Start with the newest unread records in the dominant cluster so the queue shape changes quickly.",
        urgency: "now",
      },
      {
        id: "unlock-private",
        title: "Unlock private evidence before export",
        detail: "Resolve encrypted coverage gaps before relying on snapshot summaries or sharing exports.",
        urgency: context.encryptedWaitingCount > 0 ? "next" : "watch",
      },
      {
        id: "watch-silence",
        title: "Monitor quiet segments",
        detail: "Keep follow-up pressure on clusters that have unresolved work but falling inbound activity.",
        urgency: context.silenceCandidates.length > 0 ? "next" : "watch",
      },
    ],
    emphasis: {
      tone: "slate",
      label: "Balanced review",
      headline: "Mixed-signal posture",
      body: "This inbox spans multiple signal shapes, so the system is emphasizing queue health, coverage, and repeated patterns over any single domain lens.",
    },
  };
}

function buildCustomerFeedbackProfile(context: AnalysisProfileContext): ResolvedAnalysisProfile {
  const sentiment = estimateSentiment(context.records);
  const negativeShare = clampPercent(ratio(sentiment.negative, Math.max(context.totalSignals, 1)));
  const repeatedTopicShare = clampPercent(topClusterShare(context));
  const painPointCount = context.clusters.filter((cluster) => cluster.severity !== "low").length;
  return {
    id: "customer_feedback",
    signalType: "feedback",
    analysisType: "sentiment",
    label: "Customer Feedback",
    shortLabel: "Feedback",
    description: "Tracks sentiment, recurring pain points, and repeated customer topics.",
    keyFinding: "Customer sentiment and repeated pain points are shaping the queue.",
    whyItMatters: "Repeated friction can quickly distort product decisions if the backlog is not grouped and answered.",
    highlightedAction: "Bundle the most repeated complaint into one owner thread before replying item by item.",
    evidenceCount: Math.max(sentiment.negative, context.clusters[0]?.signalCount ?? 0),
    metrics: [
      {
        id: "sentiment",
        label: "Negative sentiment",
        value: negativeShare,
        detail: `${sentiment.negative} negative / ${sentiment.positive} positive signals`,
        tone: sentiment.negative >= sentiment.positive ? "alert" : "cluster",
      },
      {
        id: "pain-points",
        label: "Pain points",
        value: painPointCount.toLocaleString(),
        detail: `${context.unresolvedSignals} still unresolved across the active queue`,
        tone: painPointCount >= 2 ? "alert" : "cluster",
      },
      {
        id: "repeated-topics",
        label: "Repeated topics",
        value: repeatedTopicShare,
        detail: topClusterLabel(context),
        tone: "cluster",
      },
      {
        id: "within-day",
        label: "Response inside 24h",
        value: `${context.currentVelocity.withinDayPercent}%`,
        detail: `Median review lag ${formatLag(context.currentVelocity.medianLagHours)}`,
        tone: context.currentVelocity.withinDayPercent < 60 ? "alert" : "cluster",
      },
    ],
    insightCards: [
      {
        id: "sentiment-readout",
        eyebrow: "Sentiment",
        title: sentiment.negative > sentiment.positive ? "Friction is outweighing praise" : "Sentiment remains recoverable",
        body: `${sentiment.negative} signals contain negative language while ${sentiment.positive} read as affirming or positive.`,
        tone: sentiment.negative > sentiment.positive ? "alert" : "cluster",
      },
      {
        id: "topic-cluster",
        eyebrow: "Repeated topic",
        title: topClusterLabel(context),
        body: context.clusters[0]
          ? `${context.clusters[0].signalCount} feedback items repeat this topic with ${context.clusters[0].confidence}% confidence.`
          : "No topic has yet repeated enough to separate from the baseline.",
      },
      {
        id: "review-gap",
        eyebrow: "Backlog",
        title: `${context.unreadSignals} unread signals`,
        body: context.unreadSignals > 0
          ? "Unread customer signals are likely hiding fresh pain points that have not entered the triage loop."
          : "The feedback queue has no unread drift right now.",
        tone: context.unreadSignals > 0 ? "alert" : "cluster",
      },
    ],
    recommendedActions: [
      {
        id: "close-negative-loop",
        title: "Cluster negative feedback into one response loop",
        detail: "Bundle the most repeated complaint into one owner thread before replying item by item.",
        urgency: "now",
      },
      {
        id: "tag-recurring-topic",
        title: "Tag the dominant pain point",
        detail: "Promote the leading repeated topic into a reusable tag or roadmap lane for faster future triage.",
        urgency: "next",
      },
      {
        id: "protect-positive-signal",
        title: "Preserve praise as counterweight",
        detail: "Keep a light sample of positive signals visible so product decisions stay balanced, not purely reactive.",
        urgency: "watch",
      },
    ],
    emphasis: {
      tone: "teal",
      label: "Customer voice",
      headline: "Listen for repeated friction",
      body: "This profile prioritizes customer sentiment, recurring pain points, and emerging topic loops so the inbox behaves more like a product listening console than a generic summary page.",
    },
  };
}

function buildAiAgentLogProfile(context: AnalysisProfileContext): ResolvedAnalysisProfile {
  const retries = countMatches(context.records, /\b(retry|retries|attempt|attempted again|backoff)\b/);
  const failureLoops = countMatches(context.records, /\b(loop|stuck|repeat(ed)? failure|re-?queue|same error)\b/);
  const timeoutPatterns = countMatches(context.records, /\b(timeout|timed out|latency|hung|stall|stalled)\b/);
  return {
    id: "ai_agent_log",
    signalType: "agent_log",
    analysisType: "anomaly",
    label: "AI Agent Log",
    shortLabel: "Agent Log",
    description: "Surfaces retry pressure, failure loops, and timeout-heavy operating patterns.",
    keyFinding: "Operational instability is clustering around retries, loops, or timeouts.",
    whyItMatters: "Repeated runtime failures compound quickly and can hide the single bottleneck that is actually blocking the system.",
    highlightedAction: "Prioritize the cluster with repeated retries or the same error string before chasing secondary symptoms.",
    evidenceCount: Math.max(retries, failureLoops, timeoutPatterns),
    metrics: [
      {
        id: "retries",
        label: "Retries",
        value: retries.toLocaleString(),
        detail: `${clampPercent(ratio(retries, Math.max(context.totalSignals, 1)))} of logs mention retries or repeated attempts`,
        tone: retries >= Math.ceil(context.totalSignals * 0.3) ? "alert" : "cluster",
      },
      {
        id: "failure-loops",
        label: "Failure loops",
        value: failureLoops.toLocaleString(),
        detail: `${context.unresolvedSignals} unresolved logs still need intervention`,
        tone: failureLoops > 0 ? "alert" : "cluster",
      },
      {
        id: "timeout-patterns",
        label: "Timeout patterns",
        value: timeoutPatterns.toLocaleString(),
        detail: `Median review lag ${formatLag(context.currentVelocity.medianLagHours)}`,
        tone: timeoutPatterns > 0 ? "alert" : "cluster",
      },
      {
        id: "dominant-failure",
        label: "Dominant failure shape",
        value: clampPercent(topClusterShare(context)),
        detail: topClusterLabel(context),
        tone: "cluster",
      },
    ],
    insightCards: [
      {
        id: "retry-pressure",
        eyebrow: "Retry pressure",
        title: retries > 0 ? "Agent runs are looping back through the queue" : "Retry pressure is low",
        body: retries > 0
          ? `${retries} logs mention retries, backoff, or repeated attempts.`
          : "Current logs do not show a meaningful retry signature.",
        tone: retries > 0 ? "alert" : "cluster",
      },
      {
        id: "timeout-signature",
        eyebrow: "Timeout signature",
        title: timeoutPatterns > 0 ? "Timeout language is recurring" : "No timeout cluster yet",
        body: timeoutPatterns > 0
          ? `${timeoutPatterns} logs mention timeouts, hangs, or latency stalls.`
          : "Timeout-specific language is not yet the dominant failure mode.",
        tone: timeoutPatterns > 0 ? "alert" : "cluster",
      },
      {
        id: "looped-errors",
        eyebrow: "Failure loop",
        title: failureLoops > 0 ? "A repeated error loop is visible" : "No hard loop signature detected",
        body: failureLoops > 0
          ? "Repeated error language suggests the same run is failing without a state reset."
          : "The current log set does not show strong evidence of repeated self-sustaining failures.",
        tone: failureLoops > 0 ? "alert" : "cluster",
      },
    ],
    recommendedActions: [
      {
        id: "stop-loop",
        title: "Stop the dominant failure loop first",
        detail: "Prioritize the cluster with repeated retries or the same error string before chasing secondary symptoms.",
        urgency: "now",
      },
      {
        id: "timeout-bucket",
        title: "Split timeout issues from logic failures",
        detail: "Create a timeout-specific bucket so latency incidents do not get mixed into tool or prompt failures.",
        urgency: "next",
      },
      {
        id: "add-runbook",
        title: "Capture a rollback runbook",
        detail: "If loops continue, attach one operator action path for pausing, resetting, and replaying the failing agent workflow.",
        urgency: "watch",
      },
    ],
    emphasis: {
      tone: "amber",
      label: "Operational telemetry",
      headline: "Break repeated failure loops",
      body: "This profile pushes retry pressure, loop signatures, and timeout-heavy behavior to the front so operator attention goes to stabilizing the runtime, not just reading logs.",
    },
  };
}

function buildIncidentReportProfile(context: AnalysisProfileContext): ResolvedAnalysisProfile {
  const severity = getSeverityMix(context.records);
  const urgentCount = severity.high;
  const spread = getUniqueForms(context.records) + new Set(context.clusters.map((cluster) => cluster.label)).size;
  return {
    id: "incident_report",
    signalType: "incident",
    analysisType: "urgency",
    label: "Incident Report",
    shortLabel: "Incident",
    description: "Tracks urgency, spread, and anomaly pressure for incident-oriented signal streams.",
    keyFinding: "Incident pressure is defined by urgency, spread, and anomaly movement.",
    whyItMatters: "When high-severity reports and live spikes align, the inbox becomes an operational escalation surface instead of a passive backlog.",
    highlightedAction: "Route the dominant high-severity incident cluster to the incident owner before working lower-severity spillover.",
    evidenceCount: Math.max(urgentCount, context.anomalyCount, context.silenceCandidates.length),
    metrics: [
      {
        id: "urgency",
        label: "Urgency",
        value: clampPercent(ratio(urgentCount, Math.max(context.totalSignals, 1))),
        detail: `${urgentCount} high-severity or high-priority reports`,
        tone: urgentCount > 0 ? "alert" : "cluster",
      },
      {
        id: "spread",
        label: "Spread",
        value: spread.toLocaleString(),
        detail: `${getUniqueForms(context.records)} forms and ${context.clusters.length} active clusters involved`,
        tone: spread >= 4 ? "alert" : "cluster",
      },
      {
        id: "anomaly",
        label: "Anomaly pressure",
        value: context.anomalyCount.toLocaleString(),
        detail: context.activityStatusTone === "spike" ? "Live spike behavior detected in the recent intake window" : "No live spike signature right now",
        tone: context.anomalyCount > 0 ? "alert" : "cluster",
      },
      {
        id: "silence-risk",
        label: "Quiet risk zones",
        value: context.silenceCandidates.length.toLocaleString(),
        detail: context.silenceCandidates[0]?.label ?? "No silent unresolved segment detected",
        tone: context.silenceCandidates.length > 0 ? "alert" : "cluster",
      },
    ],
    insightCards: [
      {
        id: "urgent-front",
        eyebrow: "Urgency",
        title: urgentCount > 0 ? "High-priority reports are active" : "No high-priority escalation is dominating",
        body: urgentCount > 0
          ? `${urgentCount} incident reports carry high-priority or high-severity posture.`
          : "The incident queue currently skews below high-severity escalation.",
        tone: urgentCount > 0 ? "alert" : "cluster",
      },
      {
        id: "spread-front",
        eyebrow: "Spread",
        title: spread >= 4 ? "The incident signature is spreading" : "Spread remains contained",
        body: spread >= 4
          ? "Multiple forms or clusters now reference related incident signals, which suggests broader blast radius."
          : "The current issue shape appears relatively contained.",
        tone: spread >= 4 ? "alert" : "cluster",
      },
      {
        id: "cluster-front",
        eyebrow: "Dominant anomaly",
        title: topClusterLabel(context),
        body: context.clusters[0]
          ? `${context.clusters[0].signalCount} reports group around this anomaly pattern.`
          : "No single anomaly cluster has yet become dominant.",
      },
    ],
    recommendedActions: [
      {
        id: "page-owners",
        title: "Escalate the highest-severity cluster",
        detail: "Route the dominant high-severity incident cluster to the incident owner before working lower-severity spillover.",
        urgency: "now",
      },
      {
        id: "contain-spread",
        title: "Check blast radius across forms",
        detail: "Use related clusters and repeated keywords to confirm whether one incident is spreading across multiple channels.",
        urgency: "next",
      },
      {
        id: "watch-silence-incident",
        title: "Watch for post-spike silence",
        detail: "A sudden drop after an incident burst can hide unresolved impact or delayed follow-up.",
        urgency: "watch",
      },
    ],
    emphasis: {
      tone: "crimson",
      label: "Incident watch",
      headline: "Escalate fast, then measure spread",
      body: "This profile is tuned to make urgency and blast radius visually dominant so the inbox behaves more like an incident room than a backlog browser.",
    },
  };
}

function buildGovernanceSignalProfile(context: AnalysisProfileContext): ResolvedAnalysisProfile {
  const conflictCount = countMatches(context.records, /\b(conflict|dispute|vote|against|opposed|fork|friction|challenge)\b/);
  const clusteringShare = clampPercent(topClusterShare(context));
  const spamRisk = (context.relatedPatterns.find((pattern) => pattern.label === "possible_duplicates")?.count ?? 0) + countMatches(context.records, /\b(spam|duplicate|bot|sybil)\b/);
  return {
    id: "governance_signal",
    signalType: "governance",
    analysisType: "risk",
    label: "Governance Signal",
    shortLabel: "Governance",
    description: "Highlights conflict signals, clustering behavior, and spam or duplicate risk.",
    keyFinding: "Governance friction is best read through conflict, clustering, and integrity risk.",
    whyItMatters: "Duplicate amplification or unresolved conflict can distort operator judgment and public coordination.",
    highlightedAction: "Split conflict-heavy signals from possible duplicates before deciding whether sentiment is authentic or amplified.",
    evidenceCount: Math.max(conflictCount, spamRisk, context.clusters[0]?.signalCount ?? 0),
    metrics: [
      {
        id: "conflict",
        label: "Conflict",
        value: conflictCount.toLocaleString(),
        detail: `${clampPercent(ratio(conflictCount, Math.max(context.totalSignals, 1)))} of records mention dispute-like language`,
        tone: conflictCount > 0 ? "alert" : "cluster",
      },
      {
        id: "clustering",
        label: "Clustering",
        value: clusteringShare,
        detail: topClusterLabel(context),
        tone: "cluster",
      },
      {
        id: "spam-risk",
        label: "Spam risk",
        value: spamRisk.toLocaleString(),
        detail: `${context.relatedPatterns.find((pattern) => pattern.label === "possible_duplicates")?.count ?? 0} duplicate-like pattern matches`,
        tone: spamRisk > 0 ? "alert" : "cluster",
      },
      {
        id: "review-lag",
        label: "Decision lag",
        value: formatLag(context.currentVelocity.medianLagHours),
        detail: `${context.unresolvedSignals} governance items still open`,
        tone: context.unresolvedSignals > 2 ? "alert" : "cluster",
      },
    ],
    insightCards: [
      {
        id: "conflict-front",
        eyebrow: "Conflict signal",
        title: conflictCount > 0 ? "Disagreement language is visible" : "Conflict language is muted",
        body: conflictCount > 0
          ? `${conflictCount} records contain conflict, opposition, or dispute language.`
          : "The current governance inbox does not show a strong conflict signature.",
        tone: conflictCount > 0 ? "alert" : "cluster",
      },
      {
        id: "cluster-front",
        eyebrow: "Coalition cluster",
        title: topClusterLabel(context),
        body: context.clusters[0]
          ? `${context.clusters[0].signalCount} governance signals are clustering around a shared topic or stance.`
          : "No coalition-like cluster has separated from the background yet.",
      },
      {
        id: "spam-front",
        eyebrow: "Integrity risk",
        title: spamRisk > 0 ? "Duplicate or spam-like pressure is present" : "Spam risk is currently low",
        body: spamRisk > 0
          ? "Repeated related patterns suggest the inbox may need dedupe or authenticity review."
          : "No immediate duplicate or spam signature is standing out.",
        tone: spamRisk > 0 ? "alert" : "cluster",
      },
    ],
    recommendedActions: [
      {
        id: "separate-conflict",
        title: "Separate genuine disagreement from noise",
        detail: "Split conflict-heavy signals from possible duplicates before deciding whether sentiment is authentic or amplified.",
        urgency: "now",
      },
      {
        id: "tag-coalitions",
        title: "Tag emerging clusters as factions or themes",
        detail: "Promote the strongest cluster into a reusable governance topic so related submissions stay grouped over time.",
        urgency: "next",
      },
      {
        id: "watch-spam",
        title: "Watch duplicate pressure",
        detail: "If duplicate-like patterns rise, require tighter review before signals influence public governance summaries.",
        urgency: "watch",
      },
    ],
    emphasis: {
      tone: "violet",
      label: "Coordination lens",
      headline: "Measure disagreement without amplifying noise",
      body: "This profile gives extra weight to conflict, clustering, and spam-risk cues so operators can distinguish real governance friction from synthetic amplification.",
    },
  };
}

function resolveSignalTypeForForm(
  form: Pick<FormSchema, "analysisProfileId" | "signalType" | "analysisType" | "purpose" | "title" | "description">,
): AnalysisSignalType {
  if (form.signalType && form.signalType in signalTypeLabels) {
    return form.signalType;
  }
  const corpus = getFormAnalysisCorpus(form);
  if (/product|roadmap|ux|usability|feature request|journey|onboarding/.test(corpus)) {
    return "product_voice";
  }
  if (/feedback|customer|user|nps|csat|support|satisfaction|review/.test(corpus)) {
    return "feedback";
  }
  if (/operation|ops|runbook|playbook|workflow health|response play/.test(corpus)) {
    return "operation";
  }
  if (/agent|llm|trace|orchestrator|tool call|timeout|retry/.test(corpus)) {
    return "agent_log";
  }
  if (/disaster|earthquake|flood|storm|evacuation|wildfire/.test(corpus)) {
    return "disaster";
  }
  if (/safety|hazard|injury|medical|protection/.test(corpus)) {
    return "safety";
  }
  if (/incident|outage|emergency|alert|breach|anomaly/.test(corpus)) {
    return "incident";
  }
  if (/community|forum|member|participation|volunteer|responder network/.test(corpus)) {
    return "community";
  }
  if (/governance|proposal|dao|vote|delegate|council|consensus/.test(corpus)) {
    return "governance";
  }
  return defaultSignalTypeByProfile[resolveAnalysisProfileIdForForm(form)];
}

function resolveAnalysisTypeForForm(
  form: Pick<FormSchema, "analysisProfileId" | "signalType" | "analysisType" | "purpose" | "title" | "description">,
  signalType?: AnalysisSignalType,
): AnalysisType {
  if (form.analysisType && form.analysisType in analysisTypeLabels) {
    return form.analysisType;
  }
  const corpus = getFormAnalysisCorpus(form);
  if (/sentiment|positive|negative|mood|emotion/.test(corpus)) {
    return "sentiment";
  }
  if (/action|next step|remediation|owner|follow-up|playbook/.test(corpus)) {
    return "action";
  }
  if (/trend|pattern|movement|weekly|participation/.test(corpus)) {
    return "trend";
  }
  if (/risk|exposure|compliance|safety/.test(corpus)) {
    return "risk";
  }
  if (/urgency|urgent|severity|escalation|critical/.test(corpus)) {
    return "urgency";
  }
  if (/anomaly|outlier|spike|failure loop/.test(corpus)) {
    return "anomaly";
  }
  if (/silence|quiet|inactive|drop-off/.test(corpus)) {
    return "silence";
  }
  if (/velocity|response lag|sla|turnaround/.test(corpus)) {
    return "velocity";
  }
  return defaultAnalysisTypeBySignalType[signalType ?? resolveSignalTypeForForm(form)];
}

function resolveSignalType(records: SignalRecord[], preferredProfileId?: string | null) {
  const counts = new Map<AnalysisSignalType, number>();
  records.forEach((record) => {
    const resolved = resolveSignalTypeForForm(record.form);
    counts.set(resolved, (counts.get(resolved) ?? 0) + 1);
  });
  const dominant = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (dominant) {
    return dominant;
  }
  if (preferredProfileId && preferredProfileId in defaultSignalTypeByProfile) {
    return defaultSignalTypeByProfile[preferredProfileId as AnalysisProfileId];
  }
  return "generic" satisfies AnalysisSignalType;
}

function resolveAnalysisType(records: SignalRecord[], signalType: AnalysisSignalType) {
  const counts = new Map<AnalysisType, number>();
  records.forEach((record) => {
    const resolved = resolveAnalysisTypeForForm(record.form, resolveSignalTypeForForm(record.form));
    counts.set(resolved, (counts.get(resolved) ?? 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? defaultAnalysisTypeBySignalType[signalType];
}

function buildUnreadMetric(context: AnalysisProfileContext): AnalysisMetric {
  return {
    id: "unread-front",
    label: "Unread",
    value: context.unreadSignals.toLocaleString(),
    detail: `${context.needsReviewSignals} active signals still need operator review`,
    tone: context.unreadSignals > 0 ? "alert" : "cluster",
  };
}

function buildAnomalyMetric(context: AnalysisProfileContext): AnalysisMetric {
  return {
    id: "spike-watch",
    label: "Spike",
    value: context.anomalyCount.toLocaleString(),
    detail: context.activityStatusTone === "spike" ? "Live spike behavior detected in the current window" : "No live spike signature right now",
    tone: context.anomalyCount > 0 || context.activityStatusTone === "spike" ? "alert" : "cluster",
  };
}

function buildSilenceMetric(context: AnalysisProfileContext): AnalysisMetric {
  return {
    id: "silence-watch",
    label: "Silence candidates",
    value: context.silenceCandidates.length.toLocaleString(),
    detail: context.silenceCandidates[0]
      ? `${context.silenceCandidates[0].label} last moved ${context.silenceCandidates[0].lastSeenLabel} ago`
      : "No silence candidate is standing out right now",
    tone: context.silenceCandidates.length > 0 ? "alert" : "cluster",
  };
}

function buildResponseLagMetric(context: AnalysisProfileContext): AnalysisMetric {
  return {
    id: "response-lag",
    label: "Response lag",
    value: formatLag(context.currentVelocity.medianLagHours),
    detail: `${context.currentVelocity.withinDayPercent}% handled inside 24h`,
    tone: context.currentVelocity.medianLagHours !== null && context.currentVelocity.medianLagHours > 24 ? "alert" : "cluster",
  };
}

function buildAnalysisLensProfile(
  baseProfile: ResolvedAnalysisProfile,
  context: AnalysisProfileContext,
  signalType: AnalysisSignalType,
  analysisType: AnalysisType,
): ResolvedAnalysisProfile {
  const sentiment = estimateSentiment(context.records);
  const urgentCount = getSeverityMix(context.records).high;
  const praiseCount = sentiment.positive;
  const negativeCount = sentiment.negative;
  const topCluster = context.clusters[0];
  const uxFrictionCount = countMatches(context.records, /\b(ux|ui|friction|confusing|hard to|difficult|unclear|can't find)\b/);
  const bugSuspectCount = countMatches(context.records, /\b(bug|broken|error|issue|glitch|crash|fail)\b/);
  const repeatedThemesCount = topCluster?.signalCount ?? 0;
  const participationHeat = context.totalSignals;
  const activityDirectionLabel =
    context.activityStatusTone === "up"
      ? "Activity up"
      : context.activityStatusTone === "drop"
        ? "Activity drop"
        : context.activityStatusTone === "spike"
          ? "Spike detected"
          : "Pulse nominal";

  let priorityMetricIds = [...baseProfile.metrics.map((metric) => metric.id)];
  let priorityCardIds = [...baseProfile.insightCards.map((card) => card.id)];
  let priorityActionIds = [...baseProfile.recommendedActions.map((action) => action.id)];
  let injectedMetrics: AnalysisMetric[] = [];
  let keyFinding = baseProfile.keyFinding;
  let whyItMatters = baseProfile.whyItMatters;
  let highlightedAction = baseProfile.highlightedAction;
  let evidenceCount = Math.max(1, baseProfile.evidenceCount);

  if ((signalType === "incident" || signalType === "disaster" || signalType === "safety") && analysisType === "urgency") {
    injectedMetrics = [
      {
        id: "high-severity",
        label: "High severity",
        value: urgentCount.toLocaleString(),
        detail: `${context.unresolvedSignals} unresolved reports still in play`,
        tone: urgentCount > 0 ? "alert" : "cluster",
      },
      buildUnreadMetric(context),
      buildAnomalyMetric(context),
      buildSilenceMetric(context),
      buildResponseLagMetric(context),
    ];
    priorityCardIds = ["urgent-front", "spread-front", "cluster-front"];
    priorityActionIds = ["page-owners", "contain-spread", "watch-silence-incident"];
    keyFinding = urgentCount > 0
      ? `${urgentCount} high-severity signals remain active, with ${context.unreadSignals} unread and ${context.anomalyCount} spike indicators in the same view.`
      : `No high-severity incident is dominating, but ${context.unreadSignals} unread signals and ${context.silenceCandidates.length} quiet zones still need a response check.`;
    whyItMatters = "Incident triage slows down when severity, fresh unread reports, and post-spike silence are split across separate cards.";
    highlightedAction = "Escalate the highest-severity unread cluster, then check lagging or suddenly silent segments for delayed impact.";
    evidenceCount = urgentCount + context.unreadSignals + context.anomalyCount + context.silenceCandidates.length;
  } else if (signalType === "feedback" && analysisType === "sentiment") {
    injectedMetrics = [
      {
        id: "negative-signals",
        label: "Negative",
        value: negativeCount.toLocaleString(),
        detail: `${praiseCount} positive or praise-like signals in the same window`,
        tone: negativeCount >= praiseCount ? "alert" : "cluster",
      },
      {
        id: "repeated-pain-point",
        label: "Repeated pain point",
        value: repeatedThemesCount.toLocaleString(),
        detail: topCluster ? topCluster.label : "No repeated pain point cluster yet",
        tone: repeatedThemesCount > 1 ? "alert" : "cluster",
      },
      {
        id: "praise-signals",
        label: "Praise",
        value: praiseCount.toLocaleString(),
        detail: praiseCount > 0 ? "Positive sentiment is still present in the stream" : "No clear praise signal is standing out",
        tone: "cluster",
      },
      {
        id: "unresolved-feedback",
        label: "Unresolved feedback",
        value: context.unresolvedSignals.toLocaleString(),
        detail: `${context.unreadSignals} unread customer signals still need a first response`,
        tone: context.unresolvedSignals > 0 ? "alert" : "cluster",
      },
    ];
    priorityCardIds = ["sentiment-readout", "topic-cluster", "review-gap"];
    priorityActionIds = ["close-negative-loop", "tag-recurring-topic", "protect-positive-signal"];
    keyFinding = negativeCount > praiseCount
      ? `Negative sentiment is outweighing praise, and the top pain-point cluster already covers ${repeatedThemesCount} signals.`
      : `Praise is still visible, but ${context.unresolvedSignals} unresolved feedback items could let fresh friction compound.`;
    whyItMatters = "Feedback becomes decision-ready when operators can separate repeated pain from one-off noise and keep praise as counterweight.";
    highlightedAction = "Group the repeated pain point into one owner thread and answer the freshest unresolved feedback before sentiment drifts further.";
    evidenceCount = negativeCount + praiseCount + repeatedThemesCount;
  } else if (signalType === "product_voice" && analysisType === "action") {
    injectedMetrics = [
      {
        id: "ux-friction",
        label: "Repeated UX friction",
        value: uxFrictionCount.toLocaleString(),
        detail: `${context.unresolvedSignals} open product voice items still need follow-up`,
        tone: uxFrictionCount > 0 ? "alert" : "cluster",
      },
      {
        id: "bug-suspect",
        label: "Bug suspicion",
        value: bugSuspectCount.toLocaleString(),
        detail: bugSuspectCount > 0 ? "Repeated bug-like language is visible" : "No bug-heavy signature is dominating",
        tone: bugSuspectCount > 0 ? "alert" : "cluster",
      },
      {
        id: "top-cluster-action",
        label: "Top cluster",
        value: clampPercent(topClusterShare(context)),
        detail: topCluster ? topCluster.label : "No dominant action cluster yet",
        tone: "cluster",
      },
      {
        id: "action-pressure",
        label: "Action pressure",
        value: context.unreadSignals.toLocaleString(),
        detail: "Unread product voice signals are likely hiding the next repeated friction loop",
        tone: context.unreadSignals > 0 ? "alert" : "cluster",
      },
    ];
    priorityCardIds = ["topic-cluster", "review-gap", "sentiment-readout"];
    priorityActionIds = ["tag-recurring-topic", "close-negative-loop", "protect-positive-signal"];
    keyFinding = topCluster
      ? `${topCluster.label} is the clearest product voice cluster, with repeated UX friction and ${bugSuspectCount} bug-like signals nearby.`
      : `Product voice is active, but the next action path still depends on clustering repeated friction.`;
    whyItMatters = "Action-oriented product review works best when friction, likely bugs, and the dominant theme are surfaced together for one operator decision.";
    highlightedAction = "Route the top repeated UX friction cluster into one product action lane and split bug-like reports into a fix-focused queue.";
    evidenceCount = Math.max(repeatedThemesCount, uxFrictionCount + bugSuspectCount);
  } else if (signalType === "community" && analysisType === "trend") {
    injectedMetrics = [
      {
        id: "activity-direction",
        label: "Activity movement",
        value: activityDirectionLabel,
        detail: context.activityStatusTone === "stable" ? "Participation is holding near baseline" : "Recent community movement changed versus the trailing window",
        tone: context.activityStatusTone === "drop" || context.activityStatusTone === "spike" ? "alert" : "cluster",
      },
      {
        id: "repeated-themes",
        label: "Repeated themes",
        value: repeatedThemesCount.toLocaleString(),
        detail: topCluster ? topCluster.label : "No dominant community theme yet",
        tone: repeatedThemesCount > 1 ? "cluster" : "cluster",
      },
      {
        id: "participation-heat",
        label: "Participation heat",
        value: participationHeat.toLocaleString(),
        detail: `${context.unreadSignals} unread community signals in the current view`,
        tone: participationHeat > Math.max(3, context.unreadSignals) ? "cluster" : "alert",
      },
      buildSilenceMetric(context),
    ];
    priorityCardIds = ["cluster-front", "conflict-front", "spam-front"];
    priorityActionIds = ["tag-coalitions", "watch-spam", "separate-conflict"];
    keyFinding = context.activityStatusTone === "drop"
      ? `Community participation softened while ${context.silenceCandidates.length} silence zones and ${repeatedThemesCount} repeated themes remain active.`
      : `${activityDirectionLabel} is being shaped by ${repeatedThemesCount} repeated themes and ${context.silenceCandidates.length} quiet community zones.`;
    whyItMatters = "Trend reading in community spaces depends on seeing movement, repeated topics, and silent pockets together before participation drifts.";
    highlightedAction = "Tag the strongest repeated theme and check whether silence zones reflect healthy resolution or operators losing contact with the community.";
    evidenceCount = repeatedThemesCount + context.silenceCandidates.length + context.totalSignals;
  } else if ((signalType === "governance" && analysisType === "trend") || (signalType === "governance" && analysisType === "risk")) {
    injectedMetrics = [buildAnomalyMetric(context), buildSilenceMetric(context), buildResponseLagMetric(context), ...baseProfile.metrics];
    priorityCardIds = ["conflict-front", "spam-front", "cluster-front"];
    priorityActionIds = ["separate-conflict", "watch-spam", "tag-coalitions"];
    keyFinding = baseProfile.keyFinding;
    whyItMatters = baseProfile.whyItMatters;
    highlightedAction = baseProfile.highlightedAction;
    evidenceCount = Math.max(1, context.relatedPatterns[0]?.count ?? context.unresolvedSignals);
  } else if ((signalType === "agent_log" || signalType === "operation") && (analysisType === "anomaly" || analysisType === "velocity")) {
    injectedMetrics = [buildResponseLagMetric(context), buildAnomalyMetric(context), buildUnreadMetric(context), ...baseProfile.metrics];
    priorityCardIds = ["retry-pressure", "timeout-signature", "looped-errors"];
    priorityActionIds = ["stop-loop", "timeout-bucket", "add-runbook"];
    keyFinding = baseProfile.keyFinding;
    whyItMatters = baseProfile.whyItMatters;
    highlightedAction = baseProfile.highlightedAction;
    evidenceCount = Math.max(1, context.unresolvedSignals + context.anomalyCount);
  } else {
    injectedMetrics = [buildUnreadMetric(context), buildResponseLagMetric(context), ...baseProfile.metrics];
    priorityCardIds = [...baseProfile.insightCards.map((card) => card.id)];
    priorityActionIds = [...baseProfile.recommendedActions.map((action) => action.id)];
    keyFinding = baseProfile.keyFinding;
    whyItMatters = baseProfile.whyItMatters;
    highlightedAction = baseProfile.highlightedAction;
    evidenceCount = Math.max(1, context.totalSignals);
  }

  return {
    ...baseProfile,
    signalType,
    analysisType,
    keyFinding,
    whyItMatters,
    highlightedAction,
    evidenceCount,
    metrics: uniqueById([...injectedMetrics, ...sortByPriority(baseProfile.metrics, priorityMetricIds)]).slice(0, 4),
    insightCards: sortByPriority(baseProfile.insightCards, priorityCardIds),
    recommendedActions: sortByPriority(baseProfile.recommendedActions, priorityActionIds),
  };
}

const analysisProfiles: Record<AnalysisProfileId, AnalysisProfileDefinition> = {
  customer_feedback: {
    id: "customer_feedback",
    label: "Customer Feedback",
    shortLabel: "Feedback",
    description: "Tracks customer sentiment, recurring pain points, and repeated topics.",
    resolve: buildCustomerFeedbackProfile,
  },
  ai_agent_log: {
    id: "ai_agent_log",
    label: "AI Agent Log",
    shortLabel: "Agent Log",
    description: "Tracks retries, failure loops, and timeout-heavy agent behavior.",
    resolve: buildAiAgentLogProfile,
  },
  incident_report: {
    id: "incident_report",
    label: "Incident Report",
    shortLabel: "Incident",
    description: "Tracks urgency, spread, and anomaly pressure.",
    resolve: buildIncidentReportProfile,
  },
  governance_signal: {
    id: "governance_signal",
    label: "Governance Signal",
    shortLabel: "Governance",
    description: "Tracks conflict, clustering, and spam-risk behavior.",
    resolve: buildGovernanceSignalProfile,
  },
  general_signal: {
    id: "general_signal",
    label: "General Signal",
    shortLabel: "General",
    description: "Balanced monitoring profile for mixed signal streams.",
    resolve: buildDefaultProfile,
  },
};

function scoreRecordAgainstProfile(record: SignalRecord, profileId: AnalysisProfileId) {
  const corpus = getCorpus(record);
  const form = record.form;
  if (form.analysisProfileId === profileId) {
    return 100;
  }

  const profileSpecificBoosts: Record<AnalysisProfileId, number> = {
    customer_feedback:
      (form.purpose === "survey" ? 16 : 0) +
      (/customer|feedback|user|nps|csat|support|satisfaction/.test(corpus) ? 22 : 0) +
      (record.category === "Praise" || record.category === "Survey" ? 10 : 0),
    ai_agent_log:
      (/agent|llm|tool call|retry|timeout|workflow|run log|trace|orchestrator/.test(corpus) ? 30 : 0) +
      (/error|failed|stuck|latency|attempt/.test(corpus) ? 16 : 0) +
      (form.purpose === "bug" ? 8 : 0),
    incident_report:
      (/incident|outage|urgent|severity|breach|emergency|alert|spread|anomaly/.test(corpus) ? 30 : 0) +
      (form.purpose === "bug" ? 12 : 0) +
      ((record.submission.severity === "high" || record.submission.priority === "high") ? 10 : 0),
    governance_signal:
      (/governance|proposal|vote|delegate|dao|conflict|spam|sybil|council|consensus/.test(corpus) ? 30 : 0) +
      (form.purpose === "custom" ? 8 : 0),
    general_signal: 4,
  };

  return profileSpecificBoosts[profileId];
}

export function listAnalysisProfileDefinitions() {
  return Object.values(analysisProfiles);
}

export function resolveAnalysisProfileIdForForm(
  form: Pick<FormSchema, "analysisProfileId" | "signalType" | "analysisType" | "purpose" | "title" | "description">,
) {
  if (form.analysisProfileId && analysisProfiles[form.analysisProfileId]) {
    return form.analysisProfileId;
  }
  const corpus = getFormAnalysisCorpus(form);
  if (/agent|llm|timeout|workflow|trace|orchestrator|run log/.test(corpus)) {
    return "ai_agent_log" satisfies AnalysisProfileId;
  }
  if (/incident|outage|emergency|alert|anomaly|breach/.test(corpus)) {
    return "incident_report" satisfies AnalysisProfileId;
  }
  if (/governance|proposal|dao|vote|delegate|council|consensus/.test(corpus)) {
    return "governance_signal" satisfies AnalysisProfileId;
  }
  if (/feedback|customer|user|nps|csat|satisfaction|support/.test(corpus) || form.purpose === "survey" || form.purpose === "feature") {
    return "customer_feedback" satisfies AnalysisProfileId;
  }
  if (form.purpose === "bug") {
    return "incident_report" satisfies AnalysisProfileId;
  }
  return "general_signal" satisfies AnalysisProfileId;
}

export function resolveProfileDistribution(records: SignalRecord[]): ProfileMatchResult[] {
  const scores = new Map<AnalysisProfileId, number>();
  records.forEach((record) => {
    (Object.keys(analysisProfiles) as AnalysisProfileId[]).forEach((profileId) => {
      scores.set(profileId, (scores.get(profileId) ?? 0) + scoreRecordAgainstProfile(record, profileId));
    });
  });
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((left, right) => right.score - left.score)
    .filter((entry) => entry.score > 0);
}

export function resolveAnalysisProfile(
  context: AnalysisProfileContext,
  preferredProfileId?: string | null,
) {
  const matchedId =
    (preferredProfileId && preferredProfileId in analysisProfiles
      ? (preferredProfileId as AnalysisProfileId)
      : null) ??
    resolveProfileDistribution(context.records)[0]?.id ??
    resolveAnalysisProfileIdForForm(context.records[0]?.form ?? { title: "", description: "" }) ??
    "general_signal";
  const signalType = resolveSignalType(context.records, matchedId);
  const analysisType = resolveAnalysisType(context.records, signalType);
  return buildAnalysisLensProfile(analysisProfiles[matchedId].resolve(context), context, signalType, analysisType);
}

export function getSignalProfileId(record: SignalRecord) {
  return resolveAnalysisProfileIdForForm(record.form);
}

export function getAnalysisProfileLabel(profileId: AnalysisProfileId) {
  return analysisProfiles[profileId]?.label ?? analysisProfiles.general_signal.label;
}

export function getAnalysisProfileShortLabel(profileId: AnalysisProfileId) {
  return analysisProfiles[profileId]?.shortLabel ?? analysisProfiles.general_signal.shortLabel;
}

export function getAnalysisSignalTypeLabel(signalType: AnalysisSignalType) {
  return signalTypeLabels[signalType] ?? signalTypeLabels.generic;
}

export function getAnalysisTypeLabel(analysisType: AnalysisType) {
  return analysisTypeLabels[analysisType] ?? analysisTypeLabels.summary;
}
